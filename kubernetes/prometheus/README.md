# Prometheus

`kube-prometheus-stack` running in the Kubernetes cluster — metrics for cluster/node/pod health, complementing Alloy's logs and the existing Grafana/Loki setup.

Installed via Helm, not yet migrated to Flux/gitops — see [`runbooks/prometheus-alloy-kubernetes-init.md`](../../runbooks/prometheus-alloy-kubernetes-init.md) for the full plan.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `monitoring` |
| Chart | `prometheus-community/kube-prometheus-stack` |
| Includes | Prometheus, Alertmanager, Prometheus Operator, kube-state-metrics, node-exporter |
| Bundled Grafana | Disabled (`grafana.enabled=false`) — reuses the existing Grafana in the `grafana` namespace |

## Grafana datasource

| Name | Type | URL |
|------|------|-----|
| prometheus | prometheus | `http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090` |

## PodSecurity note

The `monitoring` namespace defaults to a `restricted` PodSecurity level, which blocks node-exporter's DaemonSet outright (`hostNetwork`, `hostPID`, `hostPath` mounts of `/proc`, `/sys`, `/`) — pods get rejected at admission (`DESIRED 3, CURRENT 0`), not just stuck Pending. Same issue as `runbooks/longhorn-podsecurity.md`. Fixed by labeling the namespace `privileged` (see `install/fix-namespace.sh`).

## Install files

| File | Description |
|------|-------------|
| `install/install.sh` | Helm install command |
| `install/fix-namespace.sh` | Labels the `monitoring` namespace `privileged` so node-exporter can schedule |
