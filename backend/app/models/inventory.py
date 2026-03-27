from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum


class NodeType(str, Enum):
    ROUTER = "router"
    SWITCH = "switch"
    SERVER = "server"
    NAS = "nas"
    VM = "vm"
    LXC = "lxc"
    CONTAINER = "container"
    CAMERA = "camera"
    PRINTER = "printer"
    GAME_CONSOLE = "game_console"
    RASPBERRY_PI = "raspberry_pi"
    WORKSTATION = "workstation"
    ACCESS_POINT = "access_point"
    UNKNOWN = "unknown"


class NodeStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    SCANNING = "scanning"
    NEEDS_CREDS = "needs_creds"
    UNKNOWN = "unknown"


class ScanLayer(str, Enum):
    NETWORK = "network"
    SSH = "ssh"
    DOCKER = "docker"
    PROXMOX = "proxmox"
    SYNOLOGY = "synology"
    SERVICES = "services"


# ── Discovery ──────────────────────────────────────────────
class DiscoveryRequest(BaseModel):
    ranges: List[str] = []          # e.g. ["192.168.1.0/24"]
    manual_ips: List[str] = []      # explicit IPs
    timeout: int = 5


class DiscoveredHost(BaseModel):
    ip: str
    hostname: Optional[str] = None
    mac: Optional[str] = None
    vendor: Optional[str] = None
    open_ports: List[int] = []
    has_ssh: bool = False
    os_guess: Optional[str] = None
    latency_ms: Optional[float] = None


# ── Credentials ────────────────────────────────────────────
class CredentialSubmit(BaseModel):
    node_id: str
    username: str
    password: str
    port: int = 22


# ── Inventory node ─────────────────────────────────────────
class HardwareInfo(BaseModel):
    cpu_model: Optional[str] = None
    cpu_cores: Optional[int] = None
    cpu_usage: Optional[float] = None
    ram_total_gb: Optional[float] = None
    ram_used_gb: Optional[float] = None
    ram_percent: Optional[float] = None
    disk_total_gb: Optional[float] = None
    disk_used_gb: Optional[float] = None
    disk_percent: Optional[float] = None
    uptime: Optional[str] = None
    os: Optional[str] = None
    kernel: Optional[str] = None
    arch: Optional[str] = None
    temperature: Optional[float] = None


class NetworkInterface(BaseModel):
    name: str
    ip: Optional[str] = None
    mac: Optional[str] = None


class ServiceInfo(BaseModel):
    port: int
    protocol: str = "tcp"
    name: Optional[str] = None
    version: Optional[str] = None
    banner: Optional[str] = None


class DockerContainer(BaseModel):
    id: str
    name: str
    image: str
    status: str
    ports: List[str] = []
    created: Optional[str] = None
    compose_project: Optional[str] = None


class VirtualMachine(BaseModel):
    id: str
    name: str
    status: str
    os: Optional[str] = None
    cpu: Optional[int] = None
    ram_mb: Optional[int] = None
    ip: Optional[str] = None
    type: str = "vm"  # vm | lxc


class InventoryNode(BaseModel):
    id: str
    name: str
    ip: str
    type: NodeType = NodeType.UNKNOWN
    status: NodeStatus = NodeStatus.UNKNOWN
    description: Optional[str] = ""
    parent_id: Optional[str] = None
    hostname: Optional[str] = None
    mac: Optional[str] = None
    vendor: Optional[str] = None
    has_credentials: bool = False
    scanned_layers: List[ScanLayer] = []
    hardware: Optional[HardwareInfo] = None
    network_interfaces: List[NetworkInterface] = []
    services: List[ServiceInfo] = []
    docker_containers: List[DockerContainer] = []
    virtual_machines: List[VirtualMachine] = []
    last_scan: Optional[str] = None
    scan_error: Optional[str] = None


class InventoryData(BaseModel):
    nodes: List[InventoryNode] = []
    last_updated: Optional[str] = None
    version: str = "2.0"


# ── WebSocket events ───────────────────────────────────────
class WsEventType(str, Enum):
    DISCOVERY_START = "discovery_start"
    HOST_FOUND = "host_found"
    DISCOVERY_DONE = "discovery_done"
    SCAN_START = "scan_start"
    SCAN_LAYER = "scan_layer"
    SCAN_LOG = "scan_log"
    NEEDS_CREDS = "needs_creds"
    SCAN_NODE_DONE = "scan_node_done"
    SCAN_DONE = "scan_done"
    ERROR = "error"
    NODE_UPDATED = "node_updated"


class WsEvent(BaseModel):
    type: WsEventType
    node_id: Optional[str] = None
    data: Dict[str, Any] = {}
    message: Optional[str] = None
    ts: Optional[str] = None
