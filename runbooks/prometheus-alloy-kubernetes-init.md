# Prometheus + Alloy — init: Kubernetes metrics and log collection

## Context

**Status: installed manually via Helm, both running, Prometheus wired into Grafana.** Not yet in the `gitops` repo.

Goal: bring the Kubernetes cluster itself into observability. Today only the Proxmox VMs ship logs to Loki (via Alloy — see [`kubernetes/loki`](../kubernetes/loki/README.md)), and there is no metrics collection in-cluster at all. This adds:

- **Prometheus** (`kube-prometheus-stack`) for cluster/node/pod metrics
- **Alloy** (DaemonSet) for pod/container logs, shipped to the **same** Loki instance already used by the Proxmox VMs — no second Loki needed

Both are new deployments; the actual Kubernetes manifests will live in the separate `gitops` repo (`~/gitops`, `github.com/chtaube/gitops`), following the existing `apps/<name>/base` + `overlays` Kustomize pattern (see `apps/mempool`, `apps/forgejo` for reference). This file just tracks the plan/decisions.

See also [`kubernetes/grafana/roadmap/ROADMAP.md`](../kubernetes/grafana/roadmap/ROADMAP.md) and [`kubernetes/loki/ROADMAP.md`](../kubernetes/loki/ROADMAP.md), which already had the Alloy-DaemonSet-for-k8s-logs idea noted under Grafana's/Loki's docs — this runbook consolidates that with the new Prometheus piece since it's a cluster-wide concern, not specific to either service.

## Decisions made

| Decision | Value | Why |
|---|---|---|
| Metrics stack | `kube-prometheus-stack` Helm chart (Prometheus + Alertmanager + node-exporter + kube-state-metrics) | Standard, well-maintained bundle — avoids assembling each metrics component by hand |
| Bundled Grafana | Disabled (`grafana.enabled=false`) | Already running its own Grafana ([`kubernetes/grafana`](../kubernetes/grafana/README.md)) backed by CloudNativePG Postgres — no need for a second instance |
| Grafana datasource | New Prometheus datasource → `http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090` | Same pattern as the existing `loki` datasource |
| Namespace | `monitoring` | Keeps the Prometheus stack isolated, matches upstream chart convention |
| Log shipper | Grafana Alloy, DaemonSet | Already in use on the Proxmox VMs (Nextcloud, Knots) — same tool, one config language, nothing new to learn |
| Log destination | Existing Loki, `http://loki.loki.svc.cluster.local:3100` | Keeps Kubernetes and Proxmox logs in one place — no second Loki instance |
| Talos OS metrics gap | Accepted | Talos doesn't expose kube-controller-manager/scheduler metrics the way kubeadm clusters do. node-exporter and kubelet/cAdvisor metrics still work fine (standard Linux kernel underneath, `/proc`/`/sys` reachable via hostPath) — a few stock dashboard panels will just show gaps |

## Alloy (logs) — done

Installed manually via Helm. Config only discovers pods and forwards their logs to Loki so far — Kubernetes event collection was not added. See [`kubernetes/alloy/README.md`](../kubernetes/alloy/README.md) and `kubernetes/alloy/alloy-values.yaml`.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install alloy grafana/alloy \
  --namespace alloy \
  --create-namespace \
  -f alloy-values.yaml
```

Gotcha: the first attempt used the raw Alloy config (River syntax) as `alloy-values.yaml` directly — Helm expects a **Helm values** file, with the actual Alloy config nested as a string under `alloy.configMap.content`. Fixed by wrapping it properly (see the README/file above).

## Prometheus (metrics) — done

Installed manually via Helm. See [`kubernetes/prometheus/README.md`](../kubernetes/prometheus/README.md) and `kubernetes/prometheus/install/`.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set grafana.enabled=false
```

Gotcha: `monitoring` namespace defaulted to a `restricted` PodSecurity level, which **blocked node-exporter outright** at admission (`DESIRED 3, CURRENT 0` — pods never even got created, not just stuck Pending). Same failure mode as `runbooks/longhorn-podsecurity.md`. Fixed with `kubernetes/prometheus/install/fix-namespace.sh`, labeling the namespace `privileged`, then a DaemonSet rollout restart.

Confirmed `grafana.enabled=false` worked as intended — the chart's install NOTES print generic Grafana admin-password instructions regardless (static text, not conditional on the flag), which looked alarming but no second Grafana pod was actually created; only the existing one in the `grafana` namespace is running.

## Remaining steps

- [x] Add Prometheus as a Grafana datasource — `http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090`, tested successfully
- [ ] Add Kubernetes event collection to Alloy's config
- [ ] Write `apps/alloy` (or `platform/alloy`) in the `gitops` repo, wire into the relevant Kustomization
- [ ] Write `platform/kube-prometheus-stack` (or similar) in the `gitops` repo, `grafana.enabled=false`
- [ ] Validate with `kubectl kustomize` locally before pushing (bit everyone during the mempool init — cheap insurance)
- [ ] Import/curate k8s dashboards (e.g. IDs 315, 1860, 6417 from grafana.com) — check which panels break due to the Talos controller-manager/scheduler gap
- [ ] Configure Alertmanager routing (Discord/Telegram/email)
- [ ] Set retention/storage sizing for Prometheus (Longhorn PVC — Loki's 20Gi is a reasonable starting reference)
