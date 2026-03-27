"""
Network discovery: nmap ping sweep + port scan to detect SSH-capable hosts.
Falls back to pure-python socket scan if nmap is unavailable.
"""
import asyncio
import socket
import subprocess
import re
from typing import List, AsyncIterator, Optional
from app.models.inventory import DiscoveredHost

COMMON_PORTS = [22, 80, 443, 8080, 8443, 2375, 2376, 9000, 32400, 5900, 3389]
SSH_PORT = 22


async def _tcp_check(ip: str, port: int, timeout: float = 1.0) -> bool:
    try:
        _, w = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=timeout
        )
        w.close()
        return True
    except Exception:
        return False


async def _grab_banner(ip: str, port: int, timeout: float = 2.0) -> Optional[str]:
    try:
        r, w = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=timeout
        )
        try:
            banner = await asyncio.wait_for(r.read(256), timeout=1.0)
            w.close()
            return banner.decode("utf-8", errors="replace").strip()[:120]
        except Exception:
            w.close()
            return None
    except Exception:
        return None


def _nmap_available() -> bool:
    try:
        subprocess.run(["nmap", "--version"], capture_output=True, timeout=3)
        return True
    except Exception:
        return False


def _parse_nmap_xml(xml: str) -> List[dict]:
    """Minimal XML parse without lxml dependency."""
    hosts = []
    host_blocks = re.findall(r"<host\b.*?</host>", xml, re.DOTALL)
    for block in host_blocks:
        # status
        status_m = re.search(r'<status\s+state="([^"]+)"', block)
        if not status_m or status_m.group(1) != "up":
            continue
        # ip
        addr_m = re.search(r'<address\s+addr="([^"]+)"\s+addrtype="ipv4"', block)
        if not addr_m:
            continue
        ip = addr_m.group(1)
        # mac
        mac_m = re.search(r'<address\s+addr="([^"]+)"\s+addrtype="mac"', block)
        mac = mac_m.group(1) if mac_m else None
        # vendor
        vendor_m = re.search(r'addrtype="mac"[^/]*/>\s*<address[^/]*vendor="([^"]+)"', block)
        if not vendor_m:
            vendor_m = re.search(r'vendor="([^"]+)"', block)
        vendor = vendor_m.group(1) if vendor_m else None
        # hostname
        hn_m = re.search(r'<hostname\s+name="([^"]+)"', block)
        hostname = hn_m.group(1) if hn_m else None
        # latency
        lat_m = re.search(r'<rtt\s+rtt="([^"]+)"', block)
        if not lat_m:
            lat_m = re.search(r'reason_ttl="\d+"\s*/>', block)
        latency = None
        if lat_m:
            try:
                latency = float(lat_m.group(1)) * 1000
            except Exception:
                pass
        # open ports
        ports = [int(m) for m in re.findall(r'<port\s+protocol="tcp"\s+portid="(\d+)"', block)
                 if re.search(rf'portid="{m}".*?<state\s+state="open"', block, re.DOTALL)]
        # simpler port parse
        open_ports = []
        for pm in re.finditer(r'portid="(\d+)".*?<state\s+state="([^"]+)"', block, re.DOTALL):
            if pm.group(2) == "open":
                open_ports.append(int(pm.group(1)))

        hosts.append({
            "ip": ip, "mac": mac, "vendor": vendor,
            "hostname": hostname, "latency": latency,
            "open_ports": open_ports,
        })
    return hosts


async def discover_range_nmap(cidr: str, timeout: int = 5) -> List[DiscoveredHost]:
    """Use nmap for fast network sweep."""
    cmd = [
        "nmap", "-sn", "-PE", "--open", "-T4",
        f"--host-timeout={timeout}s",
        "-oX", "-", cidr
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout * 30)
        xml = stdout.decode("utf-8", errors="replace")
        raw_hosts = _parse_nmap_xml(xml)
    except Exception:
        return []

    results = []
    for h in raw_hosts:
        host = DiscoveredHost(
            ip=h["ip"],
            hostname=h.get("hostname"),
            mac=h.get("mac"),
            vendor=h.get("vendor"),
            open_ports=h.get("open_ports", []),
            has_ssh=22 in h.get("open_ports", []),
            latency_ms=h.get("latency"),
        )
        results.append(host)
    return results


async def discover_manual(ips: List[str], timeout: int = 3) -> List[DiscoveredHost]:
    """Check a list of IPs directly."""
    results = []
    tasks = [_probe_host(ip, timeout) for ip in ips]
    probed = await asyncio.gather(*tasks, return_exceptions=True)
    for r in probed:
        if isinstance(r, DiscoveredHost):
            results.append(r)
    return results


async def _probe_host(ip: str, timeout: int = 3) -> Optional[DiscoveredHost]:
    # Check if alive via SSH or common ports
    open_ports = []
    tasks = {port: _tcp_check(ip, port, timeout=float(timeout)) for port in COMMON_PORTS}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    for port, result in zip(tasks.keys(), results):
        if result is True:
            open_ports.append(port)

    if not open_ports:
        return None

    # Try to resolve hostname
    hostname = None
    try:
        hostname = socket.getfqdn(ip)
        if hostname == ip:
            hostname = None
    except Exception:
        pass

    return DiscoveredHost(
        ip=ip,
        hostname=hostname,
        open_ports=sorted(open_ports),
        has_ssh=22 in open_ports,
    )


async def port_scan(ip: str, timeout: int = 3) -> List[int]:
    """Quick scan of common ports."""
    tasks = {p: _tcp_check(ip, p, float(timeout)) for p in COMMON_PORTS}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return sorted(p for p, r in zip(tasks.keys(), results) if r is True)


def guess_os(open_ports: List[int], vendor: Optional[str] = None) -> Optional[str]:
    """Heuristic OS guess from open ports + vendor."""
    if vendor:
        v = vendor.lower()
        if any(x in v for x in ["synology", "buffalo", "qnap", "netgear"]):
            return "NAS"
        if any(x in v for x in ["raspberry", "raspberrypi"]):
            return "Raspberry Pi"
        if any(x in v for x in ["apple"]):
            return "macOS"
        if any(x in v for x in ["microsoft"]):
            return "Windows"
        if any(x in v for x in ["canon", "hp", "epson", "brother", "ricoh"]):
            return "Printer"
        if any(x in v for x in ["amcrest", "hikvision", "dahua", "reolink", "axis"]):
            return "IP Camera"
        if any(x in v for x in ["ubiquiti", "cisco", "mikrotik", "tp-link", "netgear", "zyxel"]):
            return "Network Device"
        if any(x in v for x in ["vmware"]):
            return "ESXi"
        if any(x in v for x in ["xbox", "sony", "nintendo"]):
            return "Game Console"
    if 3389 in open_ports:
        return "Windows"
    if 5900 in open_ports:
        return "Linux/macOS (VNC)"
    if 32400 in open_ports:
        return "Plex Media Server"
    return None
