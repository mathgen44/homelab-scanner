"""
Layered SSH scanner.
Emits log lines via an async callback so the WebSocket can stream them live.
"""
import asyncio
import json
import re
from typing import Optional, Callable, Awaitable, List
import paramiko

from app.models.inventory import (
    HardwareInfo, NetworkInterface, DockerContainer,
    VirtualMachine, ServiceInfo, NodeType, ScanLayer
)

LogCb = Callable[[str], Awaitable[None]]


class SSHSession:
    def __init__(self, host: str, username: str, password: str,
                 port: int = 22, timeout: int = 20):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.timeout = timeout
        self.client: Optional[paramiko.SSHClient] = None

    def connect(self) -> bool:
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            self.client.connect(
                hostname=self.host, port=self.port,
                username=self.username, password=self.password,
                timeout=self.timeout, allow_agent=False, look_for_keys=False,
            )
            return True
        except Exception:
            return False

    def run(self, cmd: str, timeout: int = 15) -> str:
        if not self.client:
            return ""
        try:
            _, stdout, _ = self.client.exec_command(cmd, timeout=timeout)
            return stdout.read().decode("utf-8", errors="replace").strip()
        except Exception:
            return ""

    def close(self):
        if self.client:
            try:
                self.client.close()
            except Exception:
                pass


# ── Layer: SSH system info ─────────────────────────────────
def scan_system(s: SSHSession) -> tuple[NodeType, HardwareInfo]:
    hw = HardwareInfo()

    # Detect type
    node_type = NodeType.SERVER
    uname = s.run("uname -a")
    dsm_check = s.run("cat /etc/VERSION 2>/dev/null | head -3")
    pve_check = s.run("pveversion 2>/dev/null")
    cpu_info_raw = s.run("cat /proc/cpuinfo 2>/dev/null | grep 'model name' | head -1")

    if dsm_check and "major" in dsm_check:
        node_type = NodeType.NAS
    elif pve_check and "pve-manager" in pve_check:
        node_type = NodeType.SERVER  # proxmox host
    elif "raspberry" in uname.lower() or "bcm" in s.run("cat /proc/cpuinfo 2>/dev/null | grep Hardware | head -1").lower():
        node_type = NodeType.RASPBERRY_PI

    # CPU
    if cpu_info_raw:
        hw.cpu_model = cpu_info_raw.split(":")[-1].strip()
    cores = s.run("nproc 2>/dev/null")
    if cores.isdigit():
        hw.cpu_cores = int(cores)

    cpu_use = s.run("top -bn1 2>/dev/null | grep 'Cpu(s)' | awk '{print $2+$4}'")
    try:
        hw.cpu_usage = round(float(cpu_use), 1)
    except Exception:
        pass

    # RAM
    mem = s.run("cat /proc/meminfo 2>/dev/null")
    mem_d: dict = {}
    for line in mem.splitlines():
        p = line.split(":")
        if len(p) == 2:
            try:
                mem_d[p[0].strip()] = int(p[1].strip().split()[0])
            except Exception:
                pass
    if "MemTotal" in mem_d:
        total = mem_d["MemTotal"]
        avail = mem_d.get("MemAvailable", mem_d.get("MemFree", 0))
        used = total - avail
        hw.ram_total_gb = round(total / 1024 / 1024, 2)
        hw.ram_used_gb = round(used / 1024 / 1024, 2)
        hw.ram_percent = round(used / total * 100, 1)

    # Disk
    disk = s.run("df -BG / 2>/dev/null | tail -1")
    parts = disk.split()
    if len(parts) >= 5:
        try:
            hw.disk_total_gb = float(parts[1].rstrip("G"))
            hw.disk_used_gb = float(parts[2].rstrip("G"))
            hw.disk_percent = float(parts[4].rstrip("%"))
        except Exception:
            pass

    # OS
    os_raw = s.run("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'")
    if not os_raw:
        os_raw = s.run("uname -s")
    if node_type == NodeType.NAS:
        dsm_ver = s.run("cat /etc/VERSION 2>/dev/null | grep productversion | cut -d= -f2 | tr -d '\"'")
        dsm_build = s.run("cat /etc/VERSION 2>/dev/null | grep buildnumber | cut -d= -f2 | tr -d '\"'")
        if dsm_ver:
            os_raw = f"DSM {dsm_ver.strip()}-{dsm_build.strip()}"
    hw.os = os_raw.strip() or None

    hw.kernel = s.run("uname -r").strip() or None
    hw.arch = s.run("uname -m").strip() or None
    hw.uptime = s.run("uptime -p 2>/dev/null || uptime").strip() or None

    # Temperature
    temp = s.run("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null")
    if temp and temp.isdigit():
        hw.temperature = round(int(temp) / 1000, 1)

    return node_type, hw


# ── Layer: Network interfaces ──────────────────────────────
def scan_network_interfaces(s: SSHSession) -> List[NetworkInterface]:
    ifaces = []
    raw = s.run("ip -j addr 2>/dev/null")
    try:
        data = json.loads(raw)
        for iface in data:
            name = iface.get("ifname", "")
            if name == "lo":
                continue
            mac = iface.get("address", "")
            ip = next(
                (a.get("local") for a in iface.get("addr_info", []) if a.get("family") == "inet"),
                None
            )
            ifaces.append(NetworkInterface(name=name, ip=ip, mac=mac))
    except Exception:
        for line in raw.splitlines():
            m = re.match(r"^\d+:\s+(\S+):", line)
            if m:
                name = m.group(1).rstrip(":")
                if name != "lo":
                    ifaces.append(NetworkInterface(name=name))
    return ifaces


# ── Layer: Docker ──────────────────────────────────────────
def scan_docker(s: SSHSession) -> tuple[bool, List[DockerContainer]]:
    which = s.run("which docker 2>/dev/null || command -v docker 2>/dev/null")
    if not which:
        return False, []
    # Check permissions
    test = s.run("docker ps 2>&1 | head -1")
    if "permission denied" in test.lower():
        # Try with sudo
        test2 = s.run("sudo docker ps 2>&1 | head -1")
        if "permission denied" in test2.lower():
            return True, []  # Docker exists but no access

    raw = s.run(
        "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Label \"com.docker.compose.project\"}}' 2>/dev/null"
    )
    containers = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            ports = [p.strip() for p in parts[4].split(",") if p.strip()] if len(parts) > 4 else []
            compose = parts[5].strip() if len(parts) > 5 else None
            containers.append(DockerContainer(
                id=parts[0][:12],
                name=parts[1],
                image=parts[2],
                status=parts[3],
                ports=ports,
                compose_project=compose or None,
            ))
    return True, containers


# ── Layer: Proxmox ─────────────────────────────────────────
def scan_proxmox(s: SSHSession) -> tuple[bool, List[VirtualMachine]]:
    pve = s.run("pveversion 2>/dev/null")
    if not pve or "pve-manager" not in pve:
        return False, []

    vms: List[VirtualMachine] = []

    # QEMU VMs
    vm_list = s.run("qm list 2>/dev/null")
    for line in vm_list.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 3:
            continue
        vm_id, vm_name, vm_status = parts[0], parts[1], parts[2]
        cpu_r = s.run(f"qm config {vm_id} 2>/dev/null | grep '^cores:' | awk '{{print $2}}'")
        mem_r = s.run(f"qm config {vm_id} 2>/dev/null | grep '^memory:' | awk '{{print $2}}'")
        ip_r = s.run(
            f"qm guest cmd {vm_id} network-get-interfaces 2>/dev/null"
            " | python3 -c \"import sys,json; d=json.load(sys.stdin); "
            "[print(a['ip-address']) for i in d for a in i.get('ip-addresses',[]) "
            "if a.get('ip-address-type')=='ipv4' and not a['ip-address'].startswith('127')]\" 2>/dev/null | head -1"
        )
        vms.append(VirtualMachine(
            id=vm_id, name=vm_name, status=vm_status, type="vm",
            cpu=int(cpu_r) if cpu_r.isdigit() else None,
            ram_mb=int(mem_r) if mem_r.isdigit() else None,
            ip=ip_r.strip() or None,
        ))

    # LXC containers
    lxc_list = s.run("pct list 2>/dev/null")
    for line in lxc_list.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        lxc_id, lxc_status = parts[0], parts[1]
        lxc_name = parts[2] if len(parts) > 2 else f"lxc-{lxc_id}"
        ip_r = s.run(f"pct exec {lxc_id} -- hostname -I 2>/dev/null | awk '{{print $1}}'")
        vms.append(VirtualMachine(
            id=lxc_id, name=lxc_name, status=lxc_status, type="lxc",
            ip=ip_r.strip() or None,
        ))

    return True, vms


# ── Layer: Services (port banner grab) ─────────────────────
KNOWN_PORTS = {
    22: "SSH", 80: "HTTP", 443: "HTTPS", 8080: "HTTP-Alt",
    8443: "HTTPS-Alt", 2375: "Docker API", 2376: "Docker TLS",
    9000: "Portainer", 32400: "Plex", 5900: "VNC",
    3389: "RDP", 9090: "Cockpit", 5000: "DSM/Flask",
    8888: "Jupyter", 3000: "Grafana/Dev", 9443: "Portainer HTTPS",
    1880: "Node-RED", 8123: "Home Assistant",
}


async def scan_services_async(ip: str, open_ports: List[int]) -> List[ServiceInfo]:
    services = []
    for port in open_ports:
        name = KNOWN_PORTS.get(port)
        services.append(ServiceInfo(port=port, name=name))
    return services


# ── Orchestrator ───────────────────────────────────────────
async def full_scan(
    node_id: str,
    ip: str,
    username: str,
    password: str,
    port: int = 22,
    open_ports: Optional[List[int]] = None,
    log: Optional[LogCb] = None,
) -> dict:
    """Run all scan layers, streaming logs via callback."""

    async def _log(msg: str):
        if log:
            await log(msg)

    result = {
        "connected": False,
        "node_type": NodeType.UNKNOWN,
        "hardware": None,
        "network_interfaces": [],
        "docker": {"found": False, "containers": []},
        "proxmox": {"found": False, "vms": []},
        "services": [],
        "scanned_layers": [],
        "error": None,
    }

    # Services layer (no SSH needed)
    if open_ports:
        await _log(f"🔍 Analyse des services sur {len(open_ports)} ports ouverts...")
        services = await scan_services_async(ip, open_ports)
        result["services"] = services
        result["scanned_layers"].append(ScanLayer.SERVICES)
        await _log(f"   → {len(services)} service(s) détecté(s) : {', '.join(s.name or str(s.port) for s in services)}")

    # SSH connection
    await _log(f"🔐 Connexion SSH à {ip}:{port} en tant que {username}...")
    loop = asyncio.get_event_loop()
    session = SSHSession(ip, username, password, port)
    connected = await loop.run_in_executor(None, session.connect)

    if not connected:
        result["error"] = "Connexion SSH échouée (credentials incorrects ou SSH inaccessible)"
        await _log(f"   ✗ {result['error']}")
        return result

    result["connected"] = True
    await _log("   ✓ Connecté !")
    result["scanned_layers"].append(ScanLayer.SSH)

    try:
        # System layer
        await _log("💻 Collecte des informations système...")
        node_type, hw = await loop.run_in_executor(None, scan_system, session)
        result["node_type"] = node_type
        result["hardware"] = hw
        await _log(f"   → OS: {hw.os or '?'} | CPU: {hw.cpu_usage or '?'}% | RAM: {hw.ram_percent or '?'}%")
        if hw.temperature:
            await _log(f"   → Température: {hw.temperature}°C")

        # Network interfaces
        await _log("🌐 Lecture des interfaces réseau...")
        ifaces = await loop.run_in_executor(None, scan_network_interfaces, session)
        result["network_interfaces"] = ifaces
        await _log(f"   → {len(ifaces)} interface(s): {', '.join(i.name for i in ifaces)}")

        # Docker layer
        await _log("🐳 Recherche de Docker...")
        docker_found, containers = await loop.run_in_executor(None, scan_docker, session)
        result["docker"] = {"found": docker_found, "containers": containers}
        if docker_found:
            result["scanned_layers"].append(ScanLayer.DOCKER)
            running = sum(1 for c in containers if "up" in c.status.lower())
            await _log(f"   ✓ Docker trouvé ! {len(containers)} container(s) ({running} actifs)")
            for c in containers[:5]:
                await _log(f"     • {c.name} [{c.image.split(':')[0]}] - {c.status}")
            if len(containers) > 5:
                await _log(f"     ... et {len(containers) - 5} autres")
        else:
            await _log("   → Docker non trouvé")

        # Proxmox layer
        await _log("🖥️  Recherche de Proxmox VE...")
        pve_found, vms = await loop.run_in_executor(None, scan_proxmox, session)
        result["proxmox"] = {"found": pve_found, "vms": vms}
        if pve_found:
            result["scanned_layers"].append(ScanLayer.PROXMOX)
            await _log(f"   ✓ Proxmox VE détecté ! {len(vms)} VM(s)/LXC(s)")
            for vm in vms[:5]:
                await _log(f"     • {vm.name} [{vm.type.upper()}] - {vm.status} {('/ ' + vm.ip) if vm.ip else ''}")
        else:
            await _log("   → Proxmox non trouvé")

        # Synology specific
        if node_type == NodeType.NAS:
            result["scanned_layers"].append(ScanLayer.SYNOLOGY)
            await _log("💾 Synology DSM détecté")
            pkg = session.run("synopkg list 2>/dev/null | head -10")
            if pkg:
                await _log(f"   → Packages: {pkg[:200]}")

    except Exception as e:
        result["error"] = str(e)
        await _log(f"   ✗ Erreur: {e}")
    finally:
        session.close()

    return result
