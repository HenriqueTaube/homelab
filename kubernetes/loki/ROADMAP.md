# Loki Roadmap

## Kubernetes + Talos OS log ingestion

Install Grafana Alloy as a DaemonSet to collect pod logs from every node and ship to Loki.

See `kubernetes/grafana/ROADMAP.md` for the full Alloy setup plan.

## Known limitations

### Loki pod is distroless — no shell

`grafana/loki:3.7.0` is a distroless image. `kubectl exec` into the pod does not work:

```
exec: "sh": executable file not found in $PATH
```

To debug Loki, use logs instead:

```bash
kubectl logs -n loki deployment/loki
kubectl logs -n loki deployment/loki --previous
```

Or use an ephemeral debug container:

```bash
kubectl debug -it -n loki deployment/loki --image=busybox --target=loki
```

## TODO

- [ ] Install Alloy as DaemonSet to collect Kubernetes pod logs
- [ ] Configure Talos OS log forwarding to Alloy (via syslog UDP)
- [ ] Configure Pi-hole Alloy to ship logs to Loki
- [ ] Set up log retention policy (currently no limit configured)
- [ ] Add Loki alerting rules for ingestion errors
