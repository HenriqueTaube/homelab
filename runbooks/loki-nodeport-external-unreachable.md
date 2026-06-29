# Loki — External VMs couldn't reach Loki via NodePort

## Context

During the migration of Loki from a standalone Ubuntu VM into the Kubernetes cluster, a `NodePort` service on port `31010` was used initially. External VMs (Nextcloud, Bitcoin Knots) use Grafana Alloy to push logs to Loki.

The Loki pod was scheduled on `worker-rasp` (`192.168.1.91`).

## Symptom

Alloy on external VMs could not push logs when pointing to `worker-rasp`:

```
192.168.1.153:31010 → connection refused
```

The same port on `worker-prox` responded correctly:

```
192.168.1.152:31010 → OK
```

## Root cause

`NodePort` is theoretically accessible on all nodes, but in practice the node where the pod was **not** running (`worker-rasp`) did not respond reliably to external traffic on that port.

## Fix

**Temporary:** configured all external Alloy agents to use `worker-prox` as the Loki endpoint:

```
http://192.168.1.152:31010/loki/api/v1/push
```

**Final fix:** migrated the Loki service to `LoadBalancer` via MetalLB, giving Loki a stable IP regardless of pod placement:

```
http://192.168.1.192:3100/loki/api/v1/push
```

## Lesson

On bare-metal Kubernetes, prefer `LoadBalancer` via MetalLB over `NodePort` for services that external hosts need to reach. A `LoadBalancer` IP is stable and independent of which node the pod runs on.

## Note

External VMs use **Alloy**, not Promtail. When debugging log ingestion from VMs, check the Alloy config and `loki.write` endpoint — there is no Promtail installed on these VMs.
