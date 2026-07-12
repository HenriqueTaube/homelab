# Runbooks

Documented incidents, fixes, and procedures for this homelab.

| Runbook | Service | Description |
|---------|---------|-------------|
| [Nextcloud Disk Full](./nextcloud-disk-full.md) | Nextcloud / Proxmox | Disk full caused MariaDB crash — LVM resize procedure |
| [Loki NodePort Unreachable](./loki-nodeport-external-unreachable.md) | Loki / Kubernetes | External VMs couldn't reach Loki via NodePort — fixed with MetalLB LoadBalancer |
| [Longhorn PodSecurity](./longhorn-podsecurity.md) | Longhorn / Kubernetes | longhorn-manager blocked by PodSecurity baseline policy |
| [WireGuard down after power outage — CGNAT](./wireguard-cgnat-after-power-outage.md) | WireGuard / Network | Power outage caused ISP to assign CGNAT IP — WireGuard unreachable until ISP switched back to public IP |
| [Forgejo MariaDB collation](./forgejo-mariadb-collation.md) | Forgejo / Database | MariaDB dump incompatible with MySQL 8 — switch to MariaDB on both sides |
| [Forgejo nested data directory](./forgejo-nested-data-directory.md) | Forgejo / Migration | tar restore created extra directory level — fixed paths in app.ini |
