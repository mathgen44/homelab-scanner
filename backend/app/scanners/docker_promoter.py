"""
Promotion des containers Docker en nœuds de l'inventaire.

Logique :
  - Pour chaque nœud ayant docker_containers :
      - Si containers ont un compose_project → créer un nœud COMPOSE_GROUP
        comme intermédiaire, avec les containers comme enfants
      - Sinon → créer les containers directement comme enfants du nœud hôte
  - Les nœuds créés ont un id stable basé sur host_id + container_name
  - Un nouveau scan sur le même hôte met à jour les nœuds existants
"""
from datetime import datetime
from typing import List, Optional
from app.models.inventory import InventoryNode, NodeType, NodeStatus, DockerContainer
from app.models import storage


def _container_node_id(host_id: str, container_name: str) -> str:
    safe = container_name.replace("/", "").replace(" ", "_").lower()
    return f"ctr_{host_id}_{safe}"


def _compose_group_id(host_id: str, project: str) -> str:
    safe = project.replace(" ", "_").lower()
    return f"compose_{host_id}_{safe}"


def promote_containers(host_node: InventoryNode) -> List[InventoryNode]:
    """
    Crée/met à jour les nœuds containers d'un hôte.
    Retourne la liste des nœuds créés/mis à jour.
    """
    if not host_node.docker_containers:
        return []

    created: List[InventoryNode] = []
    now = datetime.now().isoformat()

    # Grouper par compose_project
    groups: dict[Optional[str], List[DockerContainer]] = {}
    for c in host_node.docker_containers:
        key = c.compose_project or None
        groups.setdefault(key, []).append(c)

    for project, containers in groups.items():
        if project:
            # ── Créer le nœud COMPOSE_GROUP ───────────────────────────────
            group_id = _compose_group_id(host_node.id, project)
            group_node = InventoryNode(
                id=group_id,
                name=f"[{project}]",
                ip=host_node.ip,           # même IP que l'hôte
                type=NodeType.COMPOSE_GROUP,
                status=NodeStatus.ONLINE,
                description=f"Compose project : {project}",
                parent_id=host_node.id,
                last_scan=now,
            )
            storage.upsert(group_node)
            created.append(group_node)
            parent_for_containers = group_id
        else:
            parent_for_containers = host_node.id

        # ── Créer les nœuds containers ────────────────────────────────────
        for c in containers:
            running = "up" in c.status.lower()
            ctr_node = InventoryNode(
                id=_container_node_id(host_node.id, c.name),
                name=c.name,
                ip=host_node.ip,
                type=NodeType.CONTAINER,
                status=NodeStatus.ONLINE if running else NodeStatus.OFFLINE,
                description=c.image,
                parent_id=parent_for_containers,
                last_scan=now,
                # Stocker les infos Docker dans services pour affichage
                services=[],
                docker_containers=[c],   # le container lui-même pour le détail
            )
            storage.upsert(ctr_node)
            created.append(ctr_node)

    return created


def promote_all_containers() -> dict:
    """Parcourt tous les nœuds et promeut leurs containers."""
    nodes = storage.all_nodes()
    total_created = 0
    hosts_processed = []

    for node in nodes:
        if node.docker_containers:
            new_nodes = promote_containers(node)
            total_created += len(new_nodes)
            hosts_processed.append({
                "host": node.name,
                "host_id": node.id,
                "containers": len(node.docker_containers),
                "nodes_created": len(new_nodes),
            })

    return {
        "hosts_processed": len(hosts_processed),
        "nodes_created": total_created,
        "detail": hosts_processed,
    }


def cleanup_container_nodes(host_id: str):
    """
    Supprime les nœuds containers/compose_groups d'un hôte
    (à appeler avant un re-scan pour éviter les doublons).
    """
    nodes = storage.all_nodes()
    to_delete = [
        n.id for n in nodes
        if n.id.startswith(f"ctr_{host_id}_") or n.id.startswith(f"compose_{host_id}_")
    ]
    for nid in to_delete:
        storage.delete(nid)
    return len(to_delete)
