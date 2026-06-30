# WireGuard

VPN for remote access to the home network. Runs plain WireGuard without a web UI, configured manually via config files. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `apps/wireguard`.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `wireguard` |
| Image | `192.168.1.191:3000/henrique/wireguard:multi` (hosted on Forgejo) |
| Storage | Longhorn RWO PVC — stores `wg0.conf` |
| External IP | `192.168.1.195` (MetalLB LoadBalancer) |
| Port | `51820/UDP` |
| DNS | DuckDNS — updates automatically when public IP changes |

## Custom image

WireGuard has images available on Docker Hub, but a custom image was built from scratch to learn how it works — understanding the Dockerfile, entrypoint, and how WireGuard runs inside a container.

Built from `debian:bookworm-slim` with `wireguard-tools`, `iptables`, and a custom entrypoint. Built for `linux/amd64` and `linux/arm64` (multiarch) and pushed to the local Forgejo registry.

Source files are in `image/`:

| File | Description |
|------|-------------|
| `Dockerfile` | Image definition |
| `entrypoint.sh` | Runs `wg-quick up` on start, `wg-quick down` on stop |
| `build-multiarch.sh` | Build and push multiarch image to Forgejo |
| `build-local.sh` | Build locally for dev/testing |

### Build and push

```bash
cd kubernetes/wireguard/image

IMAGE_REPO=192.168.1.191:3000/henrique/wireguard IMAGE_TAG=multi sh build-multiarch.sh
```

## Configuration

The `wg0.conf` is stored on the Longhorn PVC and mounted into the pod at `/etc/wireguard/wg0.conf`.

**The actual config is NOT in this repo** — it contains private keys. See `config/wg0.conf.template` for the structure.

To add or change a peer:

```bash
# enter the pod via toolbox
kubectl exec -it -n wireguard deployment/wireguard -- sh

# edit the config
vi /etc/wireguard/wg0.conf

# restart the pod to apply
kubectl rollout restart deployment/wireguard -n wireguard
```

## DNS

Uses DuckDNS to keep the VPN endpoint reachable when the home public IP changes. The DuckDNS cronjob runs in Kubernetes and updates the record automatically.

> If WireGuard stops working after a power outage or modem reboot, check that the public IP is not CGNAT (`100.x.x.x`). See the [runbook](../../runbooks/wireguard-cgnat-after-power-outage.md).

## Pi-hole integration

WireGuard clients use Pi-hole as their DNS server. This means:
- Ad blocking works on all devices even outside the home network
- Local hostnames (`.home.arpa`, `.lan`) resolve correctly over VPN
- All DNS goes through Unbound — no leaks to public resolvers
