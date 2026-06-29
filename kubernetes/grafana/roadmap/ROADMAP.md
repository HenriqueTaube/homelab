# Grafana Observability Roadmap

## Kubernetes + Talos OS Observability

### 1. Install Grafana Alloy as DaemonSet

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm install alloy grafana/alloy \
  --namespace alloy \
  --create-namespace \
  -f alloy-values.yaml
```

Alloy `config.alloy` for Kubernetes should collect:
- Pod/container logs from `/var/log/pods` on each node
- Kubernetes events
- Forward everything to Loki at `http://loki.loki.svc.cluster.local:3100`

