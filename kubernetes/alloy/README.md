# Alloy

Grafana Alloy running as a DaemonSet in the Kubernetes cluster. Collects pod/container logs from every node and ships them to the existing Loki instance — the same one the Proxmox VMs already log to.

Installed via Helm (`grafana/alloy` chart), not yet migrated to Flux/gitops — see [`runbooks/prometheus-alloy-kubernetes-init.md`](../../runbooks/prometheus-alloy-kubernetes-init.md) for the full plan.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `alloy` |
| Chart | `grafana/alloy` |
| Mode | DaemonSet (one pod per node) |
| Config | `alloy-values.yaml` (`alloy.configMap.content`) |

## Log destination

| Client | Endpoint |
|--------|----------|
| Loki (in-cluster) | `http://loki.loki.svc.cluster.local:3100/loki/api/v1/push` |

## Config files

| File | Description |
|------|-------------|
| `alloy-values.yaml` | Helm values — Alloy config (River syntax) discovering Kubernetes pods and forwarding their logs to Loki |
