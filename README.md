# 🖥️ Homelab Inventory

Application web de scan et d'inventaire de homelab — découverte réseau, scan SSH progressif, topologie interactive et WebSocket temps réel.

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Architecture](#architecture)
- [Workflow typique](#workflow-typique)
- [Interface](#interface)
- [Accès réseau](#accès-réseau-important)
- [Sécurité](#sécurité)
- [API](#api)
- [Dépannage](#dépannage)

---

## Démarrage rapide

### Prérequis

- Docker & Docker Compose v2
- Accès réseau aux machines à scanner
- Accès SSH (login/mot de passe) aux serveurs à analyser

### Installation

```bash
git clone https://github.com/mathgen44/homelab-scanner.git
cd homelab-scanner
docker compose up -d --build
```

L'interface est disponible sur **http://IP-DE-VOTRE-MACHINE:3001**

L'API Swagger est disponible sur **http://IP-DE-VOTRE-MACHINE:8088/docs**

### Mise à jour

```bash
git pull
docker compose up -d --build   # si Dockerfile ou dépendances ont changé
# OU
docker compose restart          # si seulement du code Python/JSX a changé
```

---

## Architecture

```
homelab-scanner/
├── docker-compose.yml          # Orchestration (backend host network + frontend bridge)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI + WebSocket + endpoints REST
│       ├── models/
│       │   ├── inventory.py    # Modèles Pydantic (nœuds, containers, VMs...)
│       │   └── storage.py      # Lecture/écriture JSON avec tolérance aux erreurs
│       ├── scanners/
│       │   ├── engine.py       # Moteur de scan WebSocket (orchestrateur)
│       │   ├── network.py      # Découverte réseau (nmap + sockets)
│       │   ├── ssh_scanner.py  # Scanner SSH en couches (OS, Docker, Proxmox...)
│       │   ├── vm_promoter.py  # Promotion des VMs Proxmox en nœuds topologie
│       │   └── dependencies.py # Résolution automatique des liens parent/enfant
│       └── security/
│           └── vault.py        # Coffre AES-256 pour les credentials SSH
└── frontend/
    ├── Dockerfile              # Build Vite + Nginx
    ├── nginx.conf              # Proxy REST + WebSocket vers le backend
    ├── vite.config.js
    └── src/
        ├── App.jsx             # Application principale + gestion WS
        ├── App.css             # Thème dark industriel
        ├── hooks/
        │   └── useWebSocket.js # Hook WebSocket avec reconnexion automatique
        └── components/
            ├── TopologyView    # Carte réseau interactive (React Flow)
            ├── HomelabNode     # Nœud personnalisé avec CPU/RAM/badges
            ├── TableView       # Inventaire tabulaire avec tri et filtres
            ├── NodeDetail      # Panneau de détail (hardware, Docker, VMs)
            ├── ScanTerminal    # Terminal de logs SSH en temps réel
            ├── Header          # En-tête avec métriques et boutons d'action
            ├── CredentialModal # Popup de saisie des identifiants SSH
            ├── DiscoveryWizard # Assistant de découverte réseau
            └── DependencyManager # Gestion des liens parent/enfant
```

**Stack technique :**

| Composant | Technologie |
|-----------|------------|
| Backend | FastAPI (Python 3.12) |
| Scanner | Paramiko (SSH) + Nmap |
| WebSocket | `websockets` (streaming temps réel) |
| Frontend | React 18 + Vite |
| Topologie | React Flow (@xyflow/react) |
| Stockage | JSON/YAML (pas de base de données) |
| Sécurité | AES-256-GCM (coffre credentials) |
| Proxy | Nginx |

---

## Workflow typique

### Étape 1 — Découvrir les équipements

Cliquez sur **Découvrir** dans le header.

Deux modes disponibles :

- **IPs manuelles** : saisissez les adresses IP de vos équipements un par un (recommandé pour commencer)
- **Plage réseau** : entrez une plage CIDR (`192.168.1.0/24`) — nécessite nmap dans le container
- **Les deux** : combinaison des deux méthodes

Les équipements détectés apparaissent en temps réel dans la topologie avec leur statut, fabricant et ports ouverts détectés.

> **Astuce :** Commencez par saisir uniquement vos serveurs Proxmox — le scan SSH détectera automatiquement les VMs qu'ils hébergent.

### Étape 2 — Scanner les équipements SSH

Cliquez sur **Scanner tout**.

Pour chaque équipement avec SSH ouvert (port 22) :

1. Si aucun identifiant n'est connu → **popup automatique** demande le login et mot de passe
2. Les identifiants sont chiffrés AES-256 et stockés localement (`/data/vault.enc`)
3. Le scan SSH s'exécute en couches successives (visible dans l'onglet **Scan Live**) :
   - Informations système (OS, CPU, RAM, disque, température, uptime)
   - Interfaces réseau
   - Services détectés (ports ouverts → Plex, Portainer, Grafana...)
   - Containers Docker (avec groupement par projet Compose)
   - VMs et conteneurs LXC Proxmox (promus automatiquement en nœuds)
   - Packages Synology DSM

### Étape 3 — Organiser les dépendances

Allez dans l'onglet **🔗 Dépendances**.

L'application analyse automatiquement les liens logiques :
- Nœuds Proxmox → VMs hébergées (détection via `qm list` et `pct list`)
- Gateway réseau (IP se terminant par `.1` ou vendor "Livebox/Freebox") → tous les autres équipements

Cochez les suggestions souhaitées et cliquez **Appliquer**.
Vous pouvez aussi lier/délier manuellement n'importe quel équipement.

### Étape 4 — Explorer

| Onglet | Description |
|--------|-------------|
| **⬡ Topologie** | Arbre hiérarchique interactif. Clic sur un nœud → surligne son sous-arbre, estompe le reste. Clic sur la minimap → zoom global. |
| **☰ Inventaire** | Tableau avec tri par colonne, recherche texte, filtre par statut. |
| **🔗 Dépendances** | Gestion des liens parent/enfant + vue résumée des containers Docker. |
| **⌨ Scan Live** | Terminal des logs SSH en temps réel avec horodatage. |

**Actions disponibles sur un nœud (clic → panneau droit) :**
- Voir hardware (CPU, RAM, disque, température, uptime, OS)
- Voir les interfaces réseau
- Voir les services détectés
- Voir les containers Docker groupés par projet Compose (statut, image, ports)
- Voir les VMs/LXC Proxmox
- Voir les dépendances directes (nœuds enfants) et naviguer vers eux
- **✏️ Modifier** le nom, type et description du nœud
- **Scanner** ce nœud individuellement
- **Gérer les credentials SSH** (ajouter, modifier, supprimer)

---

## Interface

### Header

```
🖥 HomelabInventory  | Équipements: 9  En ligne: 7  Hors ligne: 0  Containers: 12  VMs: 3
                      [Découvrir] [⟳ Scanner tout] [Export ▾] [🗑]   ● Live
```

- **Découvrir** : ouvre l'assistant de découverte réseau
- **Scanner tout** : lance le scan SSH de tous les équipements
- **Export** : télécharge l'inventaire en JSON ou CSV
- **🗑** : réinitialise l'inventaire (avec confirmation + snapshot automatique)
- **● Live** : indicateur de connexion WebSocket (vert = connecté, rouge = déconnecté)

### Topologie

- **Drag & drop** : réorganisez les nœuds librement
- **Scroll** : zoom avant/arrière
- **Clic nœud** : sélectionne et surligne le sous-arbre (enfants + ancêtres)
- **Clic espace vide** : désélectionne
- **Clic minimap** (bas droite) : recadre sur l'ensemble du graphe

Chaque nœud affiche :
- Icône + nom + IP
- Badge de type (Serveur, NAS, VM, Routeur...)
- Indicateur de statut (vert = en ligne, rouge = hors ligne, jaune = scan en cours)
- Barres CPU et RAM (si scanné via SSH)
- Badges containers 🐳, VMs ⬜, services ⚡
- Indicateur 🔒 si aucun credential SSH configuré
- Badge 🔑 clignotant si en attente d'identifiants

---

## Accès réseau (important)

Le backend doit pouvoir atteindre vos machines via SSH. Deux configurations :

### Option A — `network_mode: host` (Linux, recommandé)

Le backend partage le réseau du host Linux, il peut accéder directement à toutes les IPs de votre LAN.

Dans `docker-compose.yml`, le backend est configuré en `network_mode: host`.
Dans `frontend/nginx.conf`, le proxy pointe vers `http://172.17.0.1:8088` (gateway Docker).

C'est la configuration par défaut de ce projet.

### Option B — Réseau bridge

Si vous ne pouvez pas utiliser `network_mode: host`, commentez-le dans `docker-compose.yml` et ajoutez :

```yaml
ports:
  - "8088:8088"
networks:
  - homelab-net
```

Cela fonctionne si votre machine Docker est sur le même sous-réseau que vos équipements.

---

## Sécurité

| Donnée | Stockage | Protection |
|--------|---------|------------|
| Mots de passe SSH | `/data/vault.enc` | AES-256-GCM chiffré |
| Clé de chiffrement | `/data/vault.key` | chmod 600, jamais transmise |
| Inventaire | `/data/inventory.json` | JSON lisible, pas de données sensibles |
| Historique | `/data/history/` | 30 derniers snapshots |

**Recommandations :**
- Utilisez des comptes SSH dédiés avec droits limités (lecture seule si possible)
- Ne rendez pas l'interface accessible sur Internet sans reverse proxy + authentification
- Le volume Docker `/data` ne doit pas être exposé publiquement
- Le fichier `vault.key` ne doit jamais être commité (inclus dans `.gitignore`)

---

## Données persistantes

Les données sont stockées dans un volume Docker nommé `homelab-data` :

```bash
# Localiser le volume
docker volume inspect homelab-scanner_homelab-data

# Accéder aux données depuis le container
docker exec homelab-backend ls /data/
docker exec homelab-backend cat /data/inventory.json

# Sauvegarder
docker cp homelab-backend:/data/ ./backup-homelab/

# Réinitialiser l'inventaire (conserve les credentials)
# → Utilisez le bouton 🗑 dans l'interface (snapshot automatique créé)
```

---

## API

Documentation interactive : **http://IP:8088/docs**

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/inventory/nodes` | Liste tous les nœuds |
| `GET` | `/api/inventory/nodes/{id}` | Détail d'un nœud |
| `PUT` | `/api/inventory/nodes/{id}` | Modifier un nœud |
| `DELETE` | `/api/inventory/reset` | Réinitialiser l'inventaire |
| `POST` | `/api/discover` | Lancer une découverte réseau |
| `POST` | `/api/scan/all` | Scanner tous les équipements |
| `POST` | `/api/scan/node/{id}` | Scanner un équipement |
| `POST` | `/api/credentials` | Enregistrer des credentials SSH |
| `DELETE` | `/api/credentials/{id}` | Supprimer des credentials |
| `GET` | `/api/topology/graph` | Données du graphe (React Flow) |
| `GET` | `/api/topology/summary` | Résumé statistiques |
| `GET` | `/api/dependencies/suggest` | Suggestions de liens |
| `POST` | `/api/dependencies/apply` | Appliquer les suggestions |
| `PATCH` | `/api/dependencies/node/{id}` | Définir le parent d'un nœud |
| `GET` | `/api/health` | Santé du service |

### WebSocket

Connexion : `ws://IP:3001/ws`

**Événements reçus :**

```json
{"type": "host_found",     "data": {"ip": "192.168.1.50", "has_ssh": true, "vendor": "Dell"}}
{"type": "needs_creds",    "node_id": "node_192_168_1_50", "data": {"name": "proxmox", "ip": "..."}}
{"type": "scan_log",       "node_id": "...", "message": "🐳 Docker trouvé ! 5 containers"}
{"type": "scan_node_done", "node_id": "...", "data": {"node": {...}}}
{"type": "scan_done",      "data": {"total": 9}}
```

**Envoyer des credentials :**

```json
{"action": "submit_credentials", "node_id": "node_192_168_1_50", "username": "admin", "password": "...", "port": 22}
```

---

## Équipements supportés

| Type | Découverte | Scan SSH | Informations collectées |
|------|-----------|----------|------------------------|
| Linux (Ubuntu/Debian) | ✅ nmap/socket | ✅ | OS, CPU, RAM, disque, interfaces, uptime, kernel |
| Raspberry Pi | ✅ | ✅ | + température CPU |
| Proxmox VE | ✅ | ✅ | + liste VMs QEMU et containers LXC avec IPs |
| Synology NAS | ✅ (vendor) | ✅ | + version DSM, packages |
| Serveur avec Docker | ✅ | ✅ | + containers, images, ports, projets Compose |
| Routeur/Switch | ✅ | ❌ | Ping/ports uniquement |
| Caméra IP | ✅ (vendor) | ❌ | Ping uniquement |
| Imprimante | ✅ (vendor) | ❌ | Ping uniquement |
| NAS génériques | ✅ | ❌ | Ping uniquement |
| Windows | ✅ (port 3389) | ❌ | Ping uniquement |

---

## Dépannage

### Le backend ne démarre pas (port déjà utilisé)

```bash
# Voir ce qui occupe le port 8088
sudo ss -tlnp | grep 8088
# Changer le port dans docker-compose.yml et backend/Dockerfile
```

### Les équipements ne s'affichent pas après un scan

```bash
# Vérifier les logs backend
docker logs homelab-backend --tail 50

# Vérifier le contenu de l'inventaire
docker exec homelab-backend cat /data/inventory.json | python3 -m json.tool | head -50
```

### Le WebSocket affiche "Déconnecté"

- Vérifiez que nginx proxifie bien `/ws` vers le backend
- Vérifiez que le backend tourne : `curl http://localhost:8088/api/health`
- En mode `network_mode: host`, l'IP dans `nginx.conf` doit être `172.17.0.1`

### Le scan SSH échoue

- Vérifiez que le port 22 est ouvert sur la machine cible
- Testez manuellement : `ssh utilisateur@IP`
- Les credentials sont-ils corrects ? Supprimez-les dans le panneau de détail et resaisissez

### Réinitialiser proprement

```bash
# Via l'UI : bouton 🗑 en haut à droite (crée un snapshot avant suppression)

# Via la ligne de commande :
docker exec homelab-backend rm /data/inventory.json
docker compose restart backend
```
