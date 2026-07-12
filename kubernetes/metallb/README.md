# MetalLB

Bare-metal load balancer for the Kubernetes cluster. Runs in Layer 2 mode, assigning real LAN IPs to `LoadBalancer` type services from a reserved address pool.

Installed via Helm through Flux. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `infrastructure/metallb`.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `metallb-system` |
| Version | `0.15.3` |
| Mode | Layer 2 |
| IP pool | `192.168.1.190` – `192.168.1.195` |

## Why

On bare-metal clusters there is no cloud provider to handle `LoadBalancer` services. MetalLB fills that gap by assigning real IPs from the local network to services that request them.

Cilium (the CNI) includes its own load balancer, but MetalLB was chosen to keep it as a dedicated separate component — easier to reason about and troubleshoot independently.

## IP assignments

| IP | Service |
|----|---------|
| `192.168.1.190` | Grafana |
| `192.168.1.191` | Forgejo |
| `192.168.1.192` | Loki |
| `192.168.1.193` | — |
| `192.168.1.194` | site-orcamentos |
| `192.168.1.195` | WireGuard |

## Config files

| File | Description |
|------|-------------|
| `config/pool.yaml` | IP address pool (`192.168.1.190-192.168.1.195`) |
| `config/l2.yaml` | L2 advertisement — binds the pool to the network |
