"""
WebSocket scan engine.
Manages the scan lifecycle and broadcasts events to all connected clients.
"""
import asyncio
import json
from datetime import datetime
from typing import Set, Optional, Dict, Any
from fastapi import WebSocket

from app.models.inventory import (
    WsEvent, WsEventType, InventoryNode, NodeType, NodeStatus,
    ScanLayer, HardwareInfo, DiscoveredHost
)
from app.models import storage
from app.security import vault
from app.scanners import network, ssh_scanner

# Global connection manager
class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, event: WsEvent):
        dead = set()
        payload = event.model_dump_json()
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self.active -= dead

    async def send(self, ws: WebSocket, event: WsEvent):
        try:
            await ws.send_text(event.model_dump_json())
        except Exception:
            self.disconnect(ws)


manager = ConnectionManager()

# Pending credential requests: node_id → asyncio.Event
_cred_requests: Dict[str, asyncio.Event] = {}

# Scan lock
_scan_lock = asyncio.Lock()
_scan_running = False


async def _emit(evt_type: WsEventType, node_id: Optional[str] = None,
                data: Dict[str, Any] = None, message: Optional[str] = None):
    event = WsEvent(
        type=evt_type,
        node_id=node_id,
        data=data or {},
        message=message,
        ts=datetime.now().isoformat(),
    )
    await manager.broadcast(event)


async def _log(node_id: str, msg: str):
    await _emit(WsEventType.SCAN_LOG, node_id=node_id, message=msg)


async def _make_log_cb(node_id: str):
    async def cb(msg: str):
        await _log(node_id, msg)
    return cb


def _node_id_from_ip(ip: str) -> str:
    return "node_" + ip.replace(".", "_")


async def run_discovery(ranges: list, manual_ips: list, timeout: int = 5):
    """Discover hosts on the network and emit events."""
    await _emit(WsEventType.DISCOVERY_START, message=f"Démarrage de la découverte réseau...")

    found: list[DiscoveredHost] = []

    # Nmap range scan
    for cidr in ranges:
        await _emit(WsEventType.SCAN_LOG, message=f"🔍 Scan nmap de {cidr}...")
        hosts = await network.discover_range_nmap(cidr, timeout)
        for h in hosts:
            found.append(h)
            node_id = _node_id_from_ip(h.ip)
            # Create/update node in inventory
            node = InventoryNode(
                id=node_id,
                name=h.hostname or h.ip,
                ip=h.ip,
                hostname=h.hostname,
                mac=h.mac,
                vendor=h.vendor,
                status=NodeStatus.ONLINE,
                has_credentials=vault.get_credential(node_id) is not None,
            )
            # Guess type
            os_guess = network.guess_os(h.open_ports, h.vendor)
            if os_guess == "NAS":
                node.type = NodeType.NAS
            elif os_guess == "Raspberry Pi":
                node.type = NodeType.RASPBERRY_PI
            elif os_guess == "IP Camera":
                node.type = NodeType.CAMERA
            elif os_guess == "Printer":
                node.type = NodeType.PRINTER
            elif os_guess == "Network Device":
                node.type = NodeType.SWITCH
            elif os_guess == "Windows":
                node.type = NodeType.WORKSTATION
            elif os_guess == "Game Console":
                node.type = NodeType.GAME_CONSOLE

            storage.upsert(node)
            await _emit(WsEventType.HOST_FOUND, node_id=node_id, data={
                "ip": h.ip,
                "hostname": h.hostname,
                "mac": h.mac,
                "vendor": h.vendor,
                "open_ports": h.open_ports,
                "has_ssh": h.has_ssh,
                "os_guess": os_guess,
                "has_credentials": node.has_credentials,
                "node": node.model_dump(),
            })

    # Manual IPs
    if manual_ips:
        await _emit(WsEventType.SCAN_LOG, message=f"📋 Vérification de {len(manual_ips)} IP(s) manuelles...")
        hosts = await network.discover_manual(manual_ips, timeout)
        for h in hosts:
            found.append(h)
            node_id = _node_id_from_ip(h.ip)
            node = InventoryNode(
                id=node_id,
                name=h.hostname or h.ip,
                ip=h.ip,
                hostname=h.hostname,
                status=NodeStatus.ONLINE,
                has_credentials=vault.get_credential(node_id) is not None,
            )
            storage.upsert(node)
            await _emit(WsEventType.HOST_FOUND, node_id=node_id, data={
                "ip": h.ip,
                "hostname": h.hostname,
                "open_ports": h.open_ports,
                "has_ssh": h.has_ssh,
                "has_credentials": node.has_credentials,
                "node": node.model_dump(),
            })

    await _emit(WsEventType.DISCOVERY_DONE, data={
        "total": len(found),
        "with_ssh": sum(1 for h in found if h.has_ssh),
    }, message=f"✓ Découverte terminée : {len(found)} hôte(s) trouvé(s)")


async def run_node_scan(node_id: str):
    """Full SSH scan of a single node. Requests creds if missing."""
    node = storage.get(node_id)
    if not node:
        await _emit(WsEventType.ERROR, node_id=node_id, message="Nœud introuvable")
        return

    # Update status
    node.status = NodeStatus.SCANNING
    storage.upsert(node)
    await _emit(WsEventType.SCAN_START, node_id=node_id,
                message=f"Démarrage du scan de {node.name} ({node.ip})")

    # Get credentials
    creds = vault.get_credential(node_id)
    if not creds:
        node.status = NodeStatus.NEEDS_CREDS
        storage.upsert(node)
        event = asyncio.Event()
        _cred_requests[node_id] = event
        await _emit(WsEventType.NEEDS_CREDS, node_id=node_id, data={
            "ip": node.ip,
            "name": node.name,
        }, message=f"🔑 Identifiants SSH requis pour {node.name} ({node.ip})")
        try:
            await asyncio.wait_for(event.wait(), timeout=120)
        except asyncio.TimeoutError:
            await _emit(WsEventType.ERROR, node_id=node_id,
                        message=f"⏱ Timeout : aucun identifiant fourni pour {node.name}")
            node.status = NodeStatus.UNKNOWN
            storage.upsert(node)
            return
        finally:
            _cred_requests.pop(node_id, None)
        creds = vault.get_credential(node_id)
        if not creds:
            return

    log_cb = await _make_log_cb(node_id)

    # Run layered scan
    result = await ssh_scanner.full_scan(
        node_id=node_id,
        ip=node.ip,
        username=creds["username"],
        password=creds["password"],
        port=creds.get("port", 22),
        open_ports=node.services and [s.port for s in node.services],
        log=log_cb,
    )

    # Merge results into node
    if result["connected"]:
        node.status = NodeStatus.ONLINE
        node.type = result["node_type"] if result["node_type"] != NodeType.UNKNOWN else node.type
        node.hardware = result["hardware"]
        node.network_interfaces = result["network_interfaces"]
        node.services = result.get("services", [])
        node.docker_containers = result["docker"]["containers"]
        node.virtual_machines = result["proxmox"]["vms"]
        node.scanned_layers = result["scanned_layers"]
        node.scan_error = result.get("error")
    else:
        node.status = NodeStatus.OFFLINE
        node.scan_error = result.get("error")

    node.has_credentials = True
    node.last_scan = datetime.now().isoformat()
    storage.upsert(node)

    # Auto-promote Proxmox VMs as child nodes (containers stay as data, not nodes)
    if result.get("connected") and result["proxmox"]["vms"]:
        from app.scanners.vm_promoter import cleanup_vm_nodes, promote_vms
        cleanup_vm_nodes(node_id)
        promoted_vms = promote_vms(node)
        if promoted_vms:
            await _log(node_id, f"⬜ {len(promoted_vms)} VM(s)/LXC promu(s) dans la topologie")

    if result.get("connected") and result["docker"]["containers"]:
        count = len(result["docker"]["containers"])
        running = sum(1 for c in result["docker"]["containers"] if "up" in c.status.lower())
        await _log(node_id, f"🐳 {count} container(s) Docker ({running} actifs) — visibles dans le panneau de détail")

    await _emit(WsEventType.SCAN_NODE_DONE, node_id=node_id,
                data={"node": node.model_dump()},
                message=f"✓ Scan terminé : {node.name}")


async def run_full_scan(node_ids: Optional[list] = None):
    """Scan all (or selected) nodes sequentially."""
    global _scan_running
    if _scan_running:
        await _emit(WsEventType.ERROR, message="Un scan est déjà en cours")
        return
    async with _scan_lock:
        _scan_running = True
        nodes = storage.all_nodes()
        if node_ids:
            nodes = [n for n in nodes if n.id in node_ids]
        # Only scan nodes that are online or have SSH
        scannable = [n for n in nodes if n.status != NodeStatus.OFFLINE or n.has_credentials]
        await _emit(WsEventType.SCAN_START, data={"total": len(scannable)},
                    message=f"Scan de {len(scannable)} équipement(s)...")
        for node in scannable:
            await run_node_scan(node.id)
            await asyncio.sleep(0.1)
        _scan_running = False
        await _emit(WsEventType.SCAN_DONE, data={"total": len(scannable)},
                    message="✓ Scan complet terminé !")


def submit_credentials(node_id: str, username: str, password: str, port: int = 22):
    """Called when user submits credentials from the UI."""
    vault.store_credential(node_id, username, password, port)
    event = _cred_requests.get(node_id)
    if event:
        event.set()
