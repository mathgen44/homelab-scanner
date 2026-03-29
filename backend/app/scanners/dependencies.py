"""
Résolution automatique des dépendances entre nœuds.
Analyse l'inventaire et établit les parent_id selon :
  - VMs/LXC détectées dans un hôte Proxmox → liées à cet hôte
  - Tout nœud sans parent → lié à la gateway réseau (routeur)
  - Heuristiques sur vendor/type pour identifier routeurs, switches
"""
from typing import List, Optional
from app.models.inventory import InventoryNode, NodeType
from app.models import storage


def _node_id_from_ip(ip: str) -> str:
    return "node_" + ip.replace(".", "_")


def resolve_dependencies() -> dict:
    """
    Analyse l'inventaire complet et retourne un dict de changements suggérés :
    { node_id: new_parent_id }
    Sans modifier l'inventaire — laisse l'utilisateur confirmer ou auto-apply.
    """
    nodes = storage.all_nodes()
    node_map = {n.id: n for n in nodes}
    ip_to_id = {n.ip: n.id for n in nodes}

    suggestions: dict[str, Optional[str]] = {}

    # ── 1. Proxmox → VMs/LXC ──────────────────────────────────────────────
    for node in nodes:
        if node.virtual_machines:
            for vm in node.virtual_machines:
                if not vm.ip:
                    continue
                vm_node_id = ip_to_id.get(vm.ip)
                if vm_node_id and vm_node_id != node.id:
                    current = node_map[vm_node_id].parent_id
                    if current != node.id:
                        suggestions[vm_node_id] = node.id

    # ── 2. Docker containers → VM ou serveur hôte ─────────────────────────
    for node in nodes:
        if node.docker_containers:
            for c in node.docker_containers:
                # Les containers sont déjà sur le même nœud, pas de node séparé
                # mais si un container a une IP connue, on peut le lier
                pass

    # ── 3. Identifier la gateway (routeur principal) ───────────────────────
    gateway_id = _find_gateway(nodes)

    # ── 4. Tout nœud sans parent → sous la gateway ────────────────────────
    if gateway_id:
        for node in nodes:
            if node.id == gateway_id:
                continue
            # Ne pas écraser une relation Proxmox→VM déjà établie
            effective_parent = suggestions.get(node.id, node.parent_id)
            if effective_parent is None:
                suggestions[node.id] = gateway_id

    # ── 5. Switches/AP → sous la gateway ──────────────────────────────────
    for node in nodes:
        if node.type in (NodeType.SWITCH, NodeType.ACCESS_POINT) and gateway_id:
            effective_parent = suggestions.get(node.id, node.parent_id)
            if effective_parent == gateway_id:
                pass  # déjà correct
            elif effective_parent is None:
                suggestions[node.id] = gateway_id

    return {
        "gateway_id": gateway_id,
        "suggestions": suggestions,
        "stats": {
            "total_nodes": len(nodes),
            "nodes_with_parent": sum(1 for n in nodes if n.parent_id or n.id in suggestions),
            "proxmox_links": sum(1 for n in nodes if n.virtual_machines),
        }
    }


def apply_dependencies(suggestions: dict[str, Optional[str]]) -> int:
    """Applique les suggestions de parent_id à l'inventaire. Retourne le nombre de nœuds modifiés."""
    nodes = storage.all_nodes()
    count = 0
    for node in nodes:
        if node.id in suggestions:
            new_parent = suggestions[node.id]
            if node.parent_id != new_parent:
                node.parent_id = new_parent
                storage.upsert(node)
                count += 1
    return count


def apply_single(node_id: str, parent_id: Optional[str]) -> bool:
    """Modifie le parent_id d'un seul nœud."""
    node = storage.get(node_id)
    if not node:
        return False
    node.parent_id = parent_id
    storage.upsert(node)
    return True


def _find_gateway(nodes: List[InventoryNode]) -> Optional[str]:
    """Trouve le nœud gateway/routeur principal."""
    # Priorité 1 : type router explicite
    for n in nodes:
        if n.type == NodeType.ROUTER:
            return n.id

    # Priorité 2 : IP se terminant par .1 ou .254
    for suffix in [".1", ".254"]:
        for n in nodes:
            if n.ip and n.ip.endswith(suffix):
                return n.id

    # Priorité 3 : vendor contenant livebox, freebox, bbox, router
    gateway_keywords = ["livebox", "freebox", "bbox", "sfr", "orange", "bouygues"]
    for n in nodes:
        vendor = (n.vendor or "").lower()
        hostname = (n.hostname or "").lower()
        if any(kw in vendor or kw in hostname for kw in gateway_keywords):
            return n.id

    # Priorité 4 : premier nœud de type switch
    for n in nodes:
        if n.type == NodeType.SWITCH:
            return n.id

    return None
