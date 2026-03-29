import json, shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List
import os

from app.models.inventory import InventoryData, InventoryNode

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
INVENTORY_FILE = DATA_DIR / "inventory.json"
HISTORY_DIR = DATA_DIR / "history"


def _ensure():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def load() -> InventoryData:
    _ensure()
    if not INVENTORY_FILE.exists():
        return InventoryData()
    try:
        raw = json.loads(INVENTORY_FILE.read_text())
        # Parse nodes individually to tolerate bad/outdated entries
        nodes = []
        for n in raw.get("nodes", []):
            try:
                nodes.append(InventoryNode(**n))
            except Exception:
                # Try with type forced to unknown for backward compat
                try:
                    n["type"] = "unknown"
                    nodes.append(InventoryNode(**n))
                except Exception:
                    pass  # Skip truly broken nodes
        return InventoryData(
            nodes=nodes,
            last_updated=raw.get("last_updated"),
            version=raw.get("version", "2.0"),
        )
    except Exception:
        return InventoryData()


def save(data: InventoryData):
    _ensure()
    if INVENTORY_FILE.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy(INVENTORY_FILE, HISTORY_DIR / f"inv_{ts}.json")
        # Keep last 30
        for old in sorted(HISTORY_DIR.glob("inv_*.json"))[:-30]:
            old.unlink()
    data.last_updated = datetime.now().isoformat()
    INVENTORY_FILE.write_text(
        json.dumps(data.model_dump(), indent=2, default=str)
    )


def upsert(node: InventoryNode):
    data = load()
    m = {n.id: n for n in data.nodes}
    m[node.id] = node
    data.nodes = list(m.values())
    save(data)


def get(node_id: str) -> Optional[InventoryNode]:
    return next((n for n in load().nodes if n.id == node_id), None)


def delete(node_id: str):
    data = load()
    data.nodes = [n for n in data.nodes if n.id != node_id]
    save(data)


def all_nodes() -> List[InventoryNode]:
    return load().nodes
