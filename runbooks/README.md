# Runbooks

Documented incidents, fixes, and procedures for this homelab.

| Runbook | Service | Description |
|---------|---------|-------------|
| [Nextcloud Disk Full](./nextcloud-disk-full.md) | Nextcloud / Proxmox | Disk full caused MariaDB crash — LVM resize procedure |
| [Loki NodePort Unreachable](./loki-nodeport-external-unreachable.md) | Loki / Kubernetes | External VMs couldn't reach Loki via NodePort — fixed with MetalLB LoadBalancer |
| [Longhorn PodSecurity](./longhorn-podsecurity.md) | Longhorn / Kubernetes | longhorn-manager blocked by PodSecurity baseline policy |
| [Longhorn Volumes Degraded](./longhorn-volumes-degraded.md) | Longhorn / Kubernetes | Volumes stuck Degraded — default StorageClass uses 3 replicas but cluster has 2 nodes |
| [Longhorn Talos Extensions](./longhorn-talos-extensions.md) | Longhorn / Talos | Longhorn requires iscsi-tools and util-linux-tools baked into the Talos node image |
| [Longhorn kubelet extraMounts](./longhorn-kubelet-extramounts.md) | Longhorn / Talos | Volume mount propagation silently fails without rshared extraMounts in kubelet config |
