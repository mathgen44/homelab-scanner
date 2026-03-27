# 🖥️ Homelab Inventory v2

Inventaire interactif de homelab avec découverte réseau, scan SSH progressif et WebSocket temps réel.

## Démarrage rapide

```bash
# Cloner / copier les fichiers, puis :
docker compose up -d --build

# Interface web :
http://localhost:3000

# API + docs Swagger :
http://localhost:8000/docs
```

## Workflow typique

### 1. Découvrir vos équipements
Clic **Découvrir** → saisir vos IPs ou plages CIDR → **Lancer**

Les hôtes détectés apparaissent en temps réel sur la topologie.

### 2. Scanner en profondeur
Clic **Scanner tout** → pour chaque équipement SSH :
- Si pas de credentials → **popup automatique** demande user/mdp
- Les credentials sont chiffrés AES-256 et stockés localement
- Les logs SSH streamés live dans l'onglet **Scan Live**

### 3. Explorer
- **Topologie** : carte interactive drag & drop
- **Inventaire** : tableau trié/filtré avec recherche
- **Scan Live** : terminal des événements en temps réel
- Clic sur un nœud → panneau détail (hardware, Docker, VMs, services)

## Accès réseau (important)

Pour que le container backend atteigne vos machines via SSH :

**Option A — Linux (recommandé) :**
```yaml
# docker-compose.yml, service backend :
network_mode: host
# Supprimer "ports:" et "networks:"
# Dans nginx.conf : proxy_pass http://172.17.0.1:8000;
```

**Option B — Bridge (défaut) :**
Fonctionne si Docker host et machines sont sur le même réseau.
Le container atteint les IPs de votre LAN via le routage du host.

## Sécurité

| Donnée | Stockage |
|--------|---------|
| Mots de passe SSH | AES-256-GCM chiffré dans `/data/vault.enc` |
| Clé de chiffrement | `/data/vault.key` (chmod 600, jamais transmise) |
| Inventaire | JSON clair dans `/data/inventory.json` |
| Historique | `/data/history/` — 30 derniers snapshots |

## Couches scannées

Pour chaque hôte SSH accessible :
1. **network** — ports ouverts, identification services
2. **ssh** — OS, CPU, RAM, disque, kernel, uptime, température
3. **docker** — containers, images, ports, compose project
4. **proxmox** — VMs QEMU, containers LXC, IPs
5. **synology** — version DSM, packages installés
6. **services** — identification par port (Plex, Portainer, Grafana...)

## API WebSocket

Connectez-vous à `ws://localhost:3000/ws` pour recevoir les événements :

```json
{"type": "host_found", "data": {"ip": "192.168.1.50", "has_ssh": true}}
{"type": "needs_creds", "node_id": "node_192_168_1_50", "data": {"name": "...", "ip": "..."}}
{"type": "scan_log", "message": "🐳 Docker trouvé ! 5 containers"}
{"type": "scan_node_done", "data": {"node": {...}}}
```

Envoyez les credentials via WebSocket :
```json
{"action": "submit_credentials", "node_id": "...", "username": "admin", "password": "...", "port": 22}
```
