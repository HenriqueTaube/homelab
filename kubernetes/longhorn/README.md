# Longhorn

Distributed persistent storage for the Kubernetes cluster. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `infrastructure/longhorn`.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `longhorn-system` |
| Version | `v1.11.1` |
| Replicas | 2 (one per node) |
| StorageClass | `longhorn-2` |
| Backup target | NFS at `192.168.1.224:/srv/backup/nfs` |
| Backup schedule | Every 2 days at 01:00, keeps 2 backups |

## Nodes with Longhorn storage

| Node | IP | Disk | Mount |
|------|----|------|-------|
| `worker-prox` | `192.168.1.152` | 500GB HDD | `/var/mnt/longhorn` |
| `worker-rasp` | `192.168.1.91` | 120GB SSD | `/var/mnt/ssd/longhorn` |

## Why Longhorn

Before Longhorn, persistent storage used plain Kubernetes PVs — volume data only existed on the node where it was first created. Pods had to be pinned with `nodeSelector` or they would fail to mount their data on a different node.

Longhorn replicates volumes across both nodes (2 replicas), so pods can schedule freely and data is always available. Volumes are also backed up automatically to NFS.

## Talos requirements

Longhorn on Talos needs two extra steps that are not in the standard install guide:

1. **System extensions** — `iscsi-tools` and `util-linux-tools` must be baked into the node image via the Talos Image Factory. See `config/talos-schematic.yaml`.
2. **kubelet extraMounts** — `rshared` bind mount for `/var/lib/longhorn` must be configured in each worker machine config.

See `INSTALL.md` for the full step-by-step.

## Files

| File | Description |
|------|-------------|
| `INSTALL.md` | Full installation guide for Talos |
| `BACKUP.md` | Backup targets, recurring job, useful commands |
| `config/storageclass.yaml` | `longhorn-2` StorageClass with 2 replicas |
| `config/talos-schematic.yaml` | Talos Image Factory schematic with required extensions |


