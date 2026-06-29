# Loki

Centralized log aggregation for all VMs and Kubernetes workloads. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `platform/loki`.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `loki` |
| Image | `grafana/loki:3.7.0` |
| Mode | Single binary |
| Storage | Longhorn RWX PVC (20Gi) |
| Config | Kubernetes ConfigMap (`loki-config`) |

## Access

| Client | Endpoint |
|--------|----------|
| Grafana (in-cluster) | `http://loki.loki.svc.cluster.local:3100` |
| Alloy on VMs (external) | `http://192.168.1.192:3100` |

External access uses a LoadBalancer service via MetalLB at `192.168.1.192`.

## Log sources

| Source | VM | Status |
|--------|----|--------|
| Nextcloud + Apache + syslog | `192.168.1.224` | Alloy configured |
| Bitcoin Knots + Electrs + syslog | knots VM | Alloy configured |
| Pi-hole | Pi-hole VM | not configured yet |

## Storage

Data lives on a Longhorn RWX PVC with 2 replicas across the 2 nodes. Longhorn backups are stored on the NFS share at `192.168.1.224:/srv/backup/nfs/loki` (served by the Nextcloud VM).

## Config files

| File | Description |
|------|-------------|
| `config/configmap.yaml` | Kubernetes ConfigMap with the full `loki.yaml` config |

