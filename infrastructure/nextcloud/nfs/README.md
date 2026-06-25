# NFS Server — Nextcloud VM

The Nextcloud VM also acts as an NFS server for the Kubernetes cluster, providing storage for service volumes and Longhorn PVC backups.

## Export

| Path | Network | Options |
|------|---------|---------|
| `/srv/backup/nfs` | `192.168.1.0/24` | `rw, sync, no_subtree_check, no_root_squash` |

## Directory layout

```
/srv/backup/nfs/
├── backupstore/   ← Longhorn backup target (all PVC snapshots)
├── forgejo/       ← NFS volume for Forgejo
├── forgejo-mysql/ ← NFS volume for Forgejo MySQL
├── grafana/       ← NFS volume for Grafana
├── loki/          ← NFS volume for Loki
├── longhorn/      ← NFS volume for Longhorn
├── wireguard/     ← NFS volume for WireGuard
└── nfs2/
```

## Install on a fresh VM

```bash
sudo apt install nfs-kernel-server

# Create the export directory
sudo mkdir -p /srv/backup/nfs

# Copy exports config
sudo cp exports /etc/exports

# Apply and start
sudo exportfs -ra
sudo systemctl enable --now nfs-kernel-server
```

## Useful commands

```bash
# Check active exports
sudo exportfs -v

# Check NFS status
systemctl status nfs-kernel-server

# Check connected clients
sudo ss -tnp | grep 2049
```
