# Runbooks

Documented incidents, fixes, and procedures for this homelab.

| Date | Runbook | Service | Description |
|------|---------|---------|-------------|
| 2026-06-25 | [Nextcloud Disk Full](./nextcloud-disk-full.md) | Nextcloud / Proxmox | Disk full caused MariaDB crash — LVM resize procedure |
| 2026-06-28 | [Loki NodePort Unreachable](./loki-nodeport-external-unreachable.md) | Loki / Kubernetes | External VMs couldn't reach Loki via NodePort — fixed with MetalLB LoadBalancer |
| 2026-06-28 | [Longhorn PodSecurity](./longhorn-podsecurity.md) | Longhorn / Kubernetes | longhorn-manager blocked by PodSecurity baseline policy |
| 2026-06-30 | [WireGuard down after power outage — CGNAT](./wireguard-cgnat-after-power-outage.md) | WireGuard / Network | Power outage caused ISP to assign CGNAT IP — WireGuard unreachable until ISP switched back to public IP |
| 2026-06-30 | [Longhorn backup target unavailable](./longhorn-backup-target-unavailable.md) | Longhorn / NFS | NFS server stopped after power outage — Longhorn backups silently failing |
| 2026-07-11 | [Forgejo MariaDB collation](./forgejo-mariadb-collation.md) | Forgejo / Database | MariaDB dump incompatible with MySQL 8 — switch to MariaDB on both sides |
| 2026-07-11 | [Forgejo nested data directory](./forgejo-nested-data-directory.md) | Forgejo / Migration | tar restore created extra directory level — fixed paths in app.ini |
