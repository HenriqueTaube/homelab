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
| 2026-07-13 | [Nextcloud data disk unmounted](./nextcloud-data-disk-unmounted.md) | Nextcloud / Storage | `/mnt/nextcloud` on `sdb1` was unmounted — remounted manually and rescanned with `occ files:scan --all` |
| 2026-07-14 | [WireGuard unreachable after router reboot — MetalLB announcing node](./wireguard-metallb-external-traffic-policy.md) | WireGuard / MetalLB | `hostNetwork` pod + `externalTrafficPolicy: Cluster` let MetalLB announce the VIP from a different node than the pod — fixed with `externalTrafficPolicy: Local` |
| 2026-07-14 | [WireGuard GitOps drift — never managed by Flux](./wireguard-gitops-drift-not-in-flux.md) | WireGuard / Flux | `apps/wireguard` was never in any Flux Kustomization's resource list; app had been deployed manually for a long time, so git had drifted (wrong PVC, missing PodSecurity labels) — diffed against the manually-applied folder and fixed |
| 2026-07-15 | [Nextcloud data disk not automounting after Proxmox host reboot](./nextcloud-data-disk-not-automounting-boot.md) | Nextcloud / Storage | Follow-up to the disk-unmounted incident — dirty ext4 flag made boot-time `systemd-fsck` fail, cascading into the mount unit failing; fixed with `e2fsck -f` and `nofail` in fstab |
