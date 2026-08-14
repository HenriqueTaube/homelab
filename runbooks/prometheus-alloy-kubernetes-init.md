# Prometheus + Alloy — init: Kubernetes metrics and log collection

## Context

**Status: DONE.** Alloy and Prometheus installed manually via Helm, both running. Prometheus wired into Grafana as a datasource, Alloy shipping pod logs + Kubernetes events to Loki. Global and Nodes dashboards imported (dotdc set) — deliberately stopped there for a minimalist setup. Not yet migrated to the `gitops` repo — still manual Helm installs.

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

Installed manually via Helm. Discovers pods and forwards their logs to Loki, plus Kubernetes events (added later, see below). See [`kubernetes/alloy/README.md`](../kubernetes/alloy/README.md) and `kubernetes/alloy/install/alloy-values.yaml`.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install alloy grafana/alloy \
  --namespace alloy \
  --create-namespace \
  -f alloy-values.yaml
```

Gotcha: the first attempt used the raw Alloy config (River syntax) as `alloy-values.yaml` directly — Helm expects a **Helm values** file, with the actual Alloy config nested as a string under `alloy.configMap.content`. Fixed by wrapping it properly (see the README/file above).

Follow-up: initial config passed `discovery.kubernetes.pods.targets` straight into `loki.source.kubernetes`, so the only Loki label surviving was the raw pod instance address — `__meta_kubernetes_*` metadata gets dropped unless explicitly promoted. Added a `discovery.relabel` step to promote `namespace`, `pod`, `container`, `node`, and `app` (from `app.kubernetes.io/name`) into real labels. Deliberately skipped pod UID/IP and container image tag as labels — those change on every restart/deploy and would blow up Loki's stream cardinality; kept out of labels, still visible in the log line itself.

### Kubernetes events — done

Added a `loki.source.kubernetes_events "events"` component (`job_name = "kubernetes-events"`, `log_format = "json"`), forwarding to the same `loki.write "default"`. Motivation: wanted a way to see things like "did a PVC/Longhorn volume have a health event" as a log list, not a metrics graph.

Diagnosis trail while getting it working, kept for reference:
- Component order in the file doesn't matter — Alloy's config language is declarative (like Terraform), not read top-to-bottom, so `loki.source.kubernetes_events` referencing `loki.write.default.receiver` works even though it's declared *after* `loki.write "default"` in the file.
- After applying, checked for RBAC `forbidden` errors in `kubectl -n alloy logs` (a real risk — `loki.source.kubernetes_events` needs cluster-scope permission to watch `events`, and the chart's default RBAC is built per-component) — found none. Confirmed via Alloy's own web UI (`kubectl -n alloy port-forward <pod> 12345:12345` → `http://localhost:12345`) that `loki.source.kubernetes_events.events` is healthy/green.
- To inspect exactly what RBAC the chart actually grants (didn't end up needing this, but the right tool for it): `helm template alloy grafana/alloy --show-only templates/rbac.yaml`.
- **Realization: this component wasn't actually the right tool for the original goal.** Kubernetes Events are mostly generic pod lifecycle noise (`Scheduled`, `Pulled`, `Killing`) and only exist when something formally calls the Events API — Longhorn's volume degraded/faulted state changes aren't guaranteed to show up there. The actual signal was already being collected since the very first Alloy config: `longhorn-manager`'s own pod logs (`{namespace="longhorn-system"}`), tailed like any other pod via `loki.source.kubernetes`. The events source is still useful for general cluster activity, just wasn't the fix for the Longhorn-visibility goal specifically.

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

## Prepare dashboards — done

`grafana.enabled=false` means the ~30 dashboards `kube-prometheus-stack` normally auto-loads via ConfigMaps + a sidecar container are also skipped — that machinery lives inside the (disabled) Grafana subchart. **Decided against flipping `grafana.enabled=true`** just to get them: that would deploy a second full Grafana (its own pod, its own SQLite DB, its own admin credentials) purely to run a sidecar, which directly contradicts the "one Grafana, reuse the existing Postgres-backed one" decision above. Importing dashboard JSON by hand into the existing Grafana gets the same result without the duplicate app.

Picks, in order:

1. [`dotdc/grafana-dashboards-kubernetes`](https://github.com/dotdc/grafana-dashboards-kubernetes) — modern, actively maintained, built for `kube-prometheus-stack`. Four views instead of one cluttered dashboard: **Global** (cluster-wide), **Nodes**, **Namespaces**, **Pods**. Preferred over the old numeric-ID dashboards (315/6417), which are getting stale.
2. [Node Exporter Full](https://grafana.com/grafana/dashboards/12132-node-exporter-full/) (ID `1860`) — host-level detail (disk I/O, network errors) the k8s-level dashboards don't cover.

Import each via Grafana → **Dashboards → New → Import**, pasting the JSON, Prometheus datasource selected.

**Imported: Global and Nodes.** Exported JSON copies saved for reference at [`kubernetes/grafana/config/Global-1786058781827.json`](../kubernetes/grafana/config/Global-1786058781827.json) and [`kubernetes/grafana/config/Nodes-1786058801144.json`](../kubernetes/grafana/config/Nodes-1786058801144.json), same pattern as the existing `proxmox-1782525535186.json`. **Decided to stop here** — Namespaces, Pods, and Node Exporter Full were on the original picks list but skipped on purpose: stated preference is a minimalist set, and Global + Nodes already cover cluster and per-node health at a glance.

Also skipped, same reasoning: a dedicated Alloy dashboard (would've needed its own `ServiceMonitor` for Alloy's `:12345/metrics` plus importing its "mixin" dashboards from the `grafana/alloy` repo) and the etcd-health stretch goal (blocked on Talos exposing etcd differently than kubeadm anyway). Both still possible later if wanted, just not pursued now.
