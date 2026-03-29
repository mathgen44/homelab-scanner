from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import asyncio

from app.models.inventory import (
    InventoryData, InventoryNode, DiscoveryRequest,
    CredentialSubmit, WsEvent, WsEventType, NodeType
)
from app.models import storage
from app.security import vault
from app.scanners import engine

app = FastAPI(title="Homelab Inventory v2", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket ──────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await engine.manager.connect(ws)
    try:
        while True:
            # Listen for client messages (credentials, commands)
            data = await ws.receive_text()
            import json
            try:
                msg = json.loads(data)
                action = msg.get("action")
                if action == "submit_credentials":
                    engine.submit_credentials(
                        node_id=msg["node_id"],
                        username=msg["username"],
                        password=msg["password"],
                        port=msg.get("port", 22),
                    )
                elif action == "ping":
                    await engine.manager.send(ws, WsEvent(type=WsEventType.SCAN_LOG, message="pong"))
            except Exception:
                pass
    except WebSocketDisconnect:
        engine.manager.disconnect(ws)


# ── Discovery ──────────────────────────────────────────────
@app.post("/api/discover")
async def discover(req: DiscoveryRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        engine.run_discovery, req.ranges, req.manual_ips, req.timeout
    )
    return {"status": "discovery_started"}


# ── Scan ───────────────────────────────────────────────────
@app.post("/api/scan/all")
async def scan_all(background_tasks: BackgroundTasks, node_ids: Optional[List[str]] = None):
    background_tasks.add_task(engine.run_full_scan, node_ids)
    return {"status": "scan_started"}


@app.post("/api/scan/node/{node_id}")
async def scan_node(node_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(engine.run_node_scan, node_id)
    return {"status": "scan_started", "node_id": node_id}


# ── Credentials ────────────────────────────────────────────
@app.post("/api/credentials")
async def save_credentials(cred: CredentialSubmit):
    vault.store_credential(cred.node_id, cred.username, cred.password, cred.port)
    engine.submit_credentials(cred.node_id, cred.username, cred.password, cred.port)
    return {"stored": True, "node_id": cred.node_id}


@app.delete("/api/credentials/{node_id}")
async def delete_credentials(node_id: str):
    vault.delete_credential(node_id)
    return {"deleted": node_id}


@app.get("/api/credentials/stored")
async def list_credentials():
    return {"node_ids": vault.list_stored_ids()}


# ── Inventory ──────────────────────────────────────────────
@app.get("/api/inventory", response_model=InventoryData)
def get_inventory():
    return storage.load()


@app.get("/api/inventory/nodes", response_model=List[InventoryNode])
def get_nodes():
    return storage.all_nodes()


@app.get("/api/inventory/nodes/{node_id}", response_model=InventoryNode)
def get_node(node_id: str):
    node = storage.get(node_id)
    if not node:
        raise HTTPException(404, "Node not found")
    return node


@app.put("/api/inventory/nodes/{node_id}", response_model=InventoryNode)
def update_node(node_id: str, node: InventoryNode):
    storage.upsert(node)
    return node


@app.delete("/api/inventory/nodes/{node_id}")
def delete_node(node_id: str):
    storage.delete(node_id)
    return {"deleted": node_id}


@app.post("/api/inventory/nodes", response_model=InventoryNode)
def add_node(node: InventoryNode):
    storage.upsert(node)
    return node


# ── Topology summary ───────────────────────────────────────
@app.get("/api/topology/summary")
def get_summary():
    from app.models.inventory import NodeStatus
    nodes = storage.all_nodes()
    online = sum(1 for n in nodes if n.status == NodeStatus.ONLINE)
    offline = sum(1 for n in nodes if n.status == NodeStatus.OFFLINE)
    containers = sum(len(n.docker_containers) for n in nodes)
    vms = sum(len(n.virtual_machines) for n in nodes)
    cpu_vals = [n.hardware.cpu_usage for n in nodes if n.hardware and n.hardware.cpu_usage is not None]
    return {
        "total": len(nodes),
        "online": online,
        "offline": offline,
        "unknown": len(nodes) - online - offline,
        "containers": containers,
        "vms": vms,
        "avg_cpu": round(sum(cpu_vals) / len(cpu_vals), 1) if cpu_vals else None,
    }


@app.get("/api/topology/graph")
def get_graph():
    from app.models.inventory import NodeStatus
    nodes = storage.all_nodes()
    TYPE_COLORS = {
        NodeType.ROUTER: "#3b82f6", NodeType.SWITCH: "#6366f1",
        NodeType.SERVER: "#8b5cf6", NodeType.NAS: "#ec4899",
        NodeType.VM: "#14b8a6", NodeType.LXC: "#0d9488",
        NodeType.CAMERA: "#f59e0b", NodeType.PRINTER: "#84cc16",
        NodeType.GAME_CONSOLE: "#22c55e", NodeType.RASPBERRY_PI: "#ef4444",
        NodeType.WORKSTATION: "#a78bfa", NodeType.ACCESS_POINT: "#38bdf8",
        NodeType.UNKNOWN: "#6b7280",
    }
    TYPE_ICONS = {
        NodeType.ROUTER: "🌐", NodeType.SWITCH: "🔀", NodeType.SERVER: "🖥️",
        NodeType.NAS: "💾", NodeType.VM: "⬜", NodeType.LXC: "📦",
        NodeType.CAMERA: "📷", NodeType.PRINTER: "🖨️",
        NodeType.GAME_CONSOLE: "🎮", NodeType.RASPBERRY_PI: "🍓",
        NodeType.WORKSTATION: "💻", NodeType.ACCESS_POINT: "📡",
        NodeType.UNKNOWN: "❓",
    }

    # ── Algorithme de layout arbre vertical sans croisements ──────────────
    # Calcul bottom-up : on place d'abord les feuilles, puis on remonte
    children: dict = {n.id: [] for n in nodes}
    roots = []
    for n in nodes:
        if n.parent_id and n.parent_id in children:
            children[n.parent_id].append(n.id)
        elif not n.parent_id:
            roots.append(n.id)

    NODE_W, NODE_H, GAP_X, GAP_Y = 180, 80, 40, 120
    positions = {}

    def subtree_width(nid: str) -> float:
        kids = children.get(nid, [])
        if not kids:
            return NODE_W
        total = sum(subtree_width(k) for k in kids) + GAP_X * (len(kids) - 1)
        return max(NODE_W, total)

    def place(nid: str, x_center: float, depth: int):
        positions[nid] = {"x": x_center - NODE_W / 2, "y": depth * (NODE_H + GAP_Y)}
        kids = children.get(nid, [])
        if not kids:
            return
        total_w = sum(subtree_width(k) for k in kids) + GAP_X * (len(kids) - 1)
        cursor = x_center - total_w / 2
        for k in kids:
            sw = subtree_width(k)
            place(k, cursor + sw / 2, depth + 1)
            cursor += sw + GAP_X

    # Place each root tree side by side
    root_cursor = 0.0
    for root in roots:
        rw = subtree_width(root)
        place(root, root_cursor + rw / 2, 0)
        root_cursor += rw + GAP_X * 3

    rf_nodes = []
    edges = []

    for n in nodes:
        color = TYPE_COLORS.get(n.type, "#6b7280")
        # Pass children ids so frontend can highlight subtree
        child_ids = children.get(n.id, [])
        rf_nodes.append({
            "id": n.id, "type": "homelabNode",
            "position": positions.get(n.id, {"x": 0, "y": 0}),
            "data": {
                "id": n.id, "label": n.name, "ip": n.ip,
                "type": n.type, "status": n.status,
                "icon": TYPE_ICONS.get(n.type, "❓"),
                "color": color,
                "hardware": n.hardware.model_dump() if n.hardware else None,
                "containers_count": len(n.docker_containers),
                "vms_count": len(n.virtual_machines),
                "services_count": len(n.services),
                "has_credentials": n.has_credentials,
                "scan_error": n.scan_error,
                "last_scan": n.last_scan,
                "scanned_layers": n.scanned_layers,
                "parent_id": n.parent_id,
                "child_ids": child_ids,
            }
        })
        if n.parent_id:
            edges.append({
                "id": f"e-{n.parent_id}-{n.id}",
                "source": n.parent_id, "target": n.id,
                "type": "smoothstep",
                "animated": n.status == NodeStatus.ONLINE,
                "style": {"stroke": color, "strokeWidth": 2, "opacity": 0.7},
            })

    return {"nodes": rf_nodes, "edges": edges}


# ── Reset inventory ────────────────────────────────────────────────────────
@app.delete("/api/inventory/reset")
def reset_inventory():
    """Efface complètement l'inventaire et repart à zéro."""
    import shutil
    from pathlib import Path
    data_dir = Path(storage.DATA_DIR)
    inv_file = storage.INVENTORY_FILE
    history_dir = storage.HISTORY_DIR
    # Archive current inventory before deleting
    if inv_file.exists():
        ts = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
        history_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(inv_file, history_dir / f"pre_reset_{ts}.json")
        inv_file.unlink()
    return {"reset": True, "message": "Inventaire réinitialisé"}


from app.scanners.dependencies import resolve_dependencies, apply_dependencies, apply_single
from app.scanners.vm_promoter import promote_all_vms, cleanup_vm_nodes, promote_vms

# ── VM promotion ───────────────────────────────────────────────────────────
@app.post("/api/vms/promote")
def promote_vms_endpoint():
    result = promote_all_vms()
    return result

@app.post("/api/vms/promote/{node_id}")
def promote_node_vms(node_id: str):
    node = storage.get(node_id)
    if not node:
        raise HTTPException(404, "Node not found")
    cleanup_vm_nodes(node_id)
    promoted = promote_vms(node)
    return {"node_id": node_id, "nodes_created": len(promoted)}

@app.delete("/api/vms/nodes/{host_id}")
def remove_vm_nodes(host_id: str):
    count = cleanup_vm_nodes(host_id)
    return {"deleted": count}

# ── Dependencies ───────────────────────────────────────────────────────────
@app.get("/api/dependencies/suggest")
def suggest_dependencies():
    """Analyse l'inventaire et retourne les liens parent/enfant suggérés."""
    return resolve_dependencies()


@app.post("/api/dependencies/apply")
def apply_all_dependencies():
    """Applique automatiquement toutes les suggestions de dépendances."""
    result = resolve_dependencies()
    count = apply_dependencies(result["suggestions"])
    return {"applied": count, "suggestions": result["suggestions"]}


@app.patch("/api/dependencies/node/{node_id}")
def set_parent(node_id: str, parent_id: Optional[str] = None):
    """Définit manuellement le parent d'un nœud (None = pas de parent)."""
    ok = apply_single(node_id, parent_id)
    if not ok:
        raise HTTPException(404, "Node not found")
    return {"node_id": node_id, "parent_id": parent_id}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0"}
