"""
Promotion des VMs/LXC Proxmox en nœuds de l'inventaire.

Logique :
  - Pour chaque nœud Proxmox ayant virtual_machines :
      - Créer/mettre à jour un nœud VM ou LXC comme enfant du nœud Proxmox
      - Si une IP correspond à un nœud existant découvert par scan réseau,
        fusionner les informations (ne pas créer de doublon)
  - id stable : vm_{host_id}_{vm_id}
"""
from datetime import datetime
from typing import List
from app.models.inventory import InventoryNode, NodeType, NodeStatus, VirtualMachine
from app.models import storage


def _vm_node_id(host_id: str, vm_id: str) -> str:
    return f"vm_{host_id}_{vm_id}"


def _network_node_id(ip: str) -> str:
    return "node_" + ip.replace(".", "_")


def promote_vms(host_node: InventoryNode) -> List[InventoryNode]:
    """
    Crée/met à jour les nœuds VM d'un hôte Proxmox.
    Si une IP correspond à un nœud découvert par scan réseau → on met à jour
    ce nœud existant plutôt que d'en créer un doublon.
    Retourne la liste des nœuds créés/mis à jour.
    """
    if not host_node.virtual_machines:
        return []

    created: List[InventoryNode] = []
    now = datetime.now().isoformat()
    all_nodes = storage.all_nodes()
    ip_to_node = {n.ip: n for n in all_nodes if n.ip}

    for vm in host_node.virtual_machines:
        vm_type = NodeType.LXC if vm.type == "lxc" else NodeType.VM
        running = vm.status.lower() in ("running", "online")
        status = NodeStatus.ONLINE if running else NodeStatus.OFFLINE

        # Check if a node already exists with this IP (from network scan)
        existing = ip_to_node.get(vm.ip) if vm.ip else None

        if existing and existing.id != host_node.id:
            # Merge: update existing node with VM info rather than duplicate
            existing.type = vm_type
            existing.parent_id = host_node.id
            existing.status = status
            if not existing.name or existing.name == existing.ip:
                existing.name = vm.name
            existing.description = (
                f"{vm.type.upper()} · {vm.cpu or '?'} vCPU · "
                f"{round(vm.ram_mb/1024, 1) if vm.ram_mb else '?'} GB RAM"
            )
            existing.last_scan = now
            storage.upsert(existing)
            created.append(existing)
        else:
            # Create a new node for this VM
            vm_node_id = _vm_node_id(host_node.id, vm.id)
            desc = (
                f"{vm.type.upper()} · {vm.cpu or '?'} vCPU · "
                f"{round(vm.ram_mb/1024, 1) if vm.ram_mb else '?'} GB RAM"
            )
            vm_node = InventoryNode(
                id=vm_node_id,
                name=vm.name,
                ip=vm.ip or f"vm-{vm.id}",
                type=vm_type,
                status=status,
                description=desc,
                parent_id=host_node.id,
                last_scan=now,
            )
            storage.upsert(vm_node)
            # Register IP mapping for future dedup
            if vm.ip:
                ip_to_node[vm.ip] = vm_node
            created.append(vm_node)

    return created


def promote_all_vms() -> dict:
    """Parcourt tous les nœuds Proxmox et promeut leurs VMs."""
    nodes = storage.all_nodes()
    total_created = 0
    hosts_processed = []

    for node in nodes:
        if node.virtual_machines and "proxmox" in node.scanned_layers:
            new_nodes = promote_vms(node)
            total_created += len(new_nodes)
            hosts_processed.append({
                "host": node.name,
                "host_id": node.id,
                "vms": len(node.virtual_machines),
                "nodes_created": len(new_nodes),
            })

    return {
        "hosts_processed": len(hosts_processed),
        "nodes_created": total_created,
        "detail": hosts_processed,
    }


def cleanup_vm_nodes(host_id: str) -> int:
    """
    Supprime les nœuds VM créés par promotion pour un hôte.
    Ne supprime pas les nœuds issus de fusion (découverts par scan réseau).
    """
    nodes = storage.all_nodes()
    to_delete = [n.id for n in nodes if n.id.startswith(f"vm_{host_id}_")]
    for nid in to_delete:
        storage.delete(nid)
    return len(to_delete)
