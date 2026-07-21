# WireGuard test on worker-rasp — node IP hijacked by wg0, then NAT broken by wrong interface in PostUp/PostDown

## Status

**SOLVED.** All three parts confirmed fixed. WireGuard runs correctly on `worker-rasp`, with `end0` added to `PostUp`/`PostDown` alongside `ens18` — tunnel and NAT/forwarding both confirmed working.

## What happened

Testing whether `wireguard` (currently pinned to `worker-prox` via LoadBalancer + `externalTrafficPolicy: Local`, see [wireguard-metallb-external-traffic-policy.md](./wireguard-metallb-external-traffic-policy.md)) also works on `worker-rasp` (Raspberry Pi 5, ARM64 node). Added a `nodeSelector: kubernetes.io/hostname: worker-rasp` to `apps/wireguard/overlays/homelab/patch-deployment.yaml` and pushed.

Two unrelated problems surfaced, one after another.

## Part 1 — Flux reconcile never applied the change, unrelated cnpg webhook failure

`flux get events` showed `Kustomization/apps` stuck in `DependencyNotReady`, retrying every 30s for hours. `apps` has `dependsOn: [infrastructure, platform]` (`clusters/homelab/apps.yaml`), and `Kustomization/platform` was failing:

```
Cluster/grafana-longhorn-db/pg-grafana-longhorn dry-run failed (InternalError):
failed calling webhook "mcluster.cnpg.io": failed to call webhook: Post
"https://cnpg-webhook-service.cnpg-system.svc:443/mutate-postgresql-cnpg-io-v1-cluster?timeout=10s":
tls: failed to verify certificate: x509: certificate signed by unknown authority
```

Diagnosis: `cnpg-controller-manager` pod had 88 restarts, last one ~11h before the failure window started. CNPG's own cert-rotation reconciler rotated the webhook's serving cert (`Secret/cnpg-webhook-cert` in `cnpg-system`, `notBefore` ~6h before the failures began) and updated the `MutatingWebhookConfiguration`'s `caBundle` to match — confirmed via fingerprint comparison, they matched. But the *live* TLS handshake kept failing anyway. The only thing that explains both facts at once: the already-running manager process was still serving the **old** cert from memory — it never reloaded the new one off disk after the rotation.

Fix: `kubectl rollout restart deployment/cnpg-controller-manager -n cnpg-system`. Stateless controller, Kubernetes recreates it immediately — no data risk. Manager restarted, re-read the (already correct) cert from its own Secret, `platform` reconciled successfully, `apps` unblocked, wireguard's `nodeSelector` change finally rolled out.

**Lesson:** if a CNPG (or any operator with self-managed webhook certs) webhook starts failing with `x509: certificate signed by unknown authority`, don't assume the Secret/caBundle are out of sync — check whether they already match. If they do, the running webhook pod itself is serving a stale cert and just needs a restart.

## Part 2 — worker-rasp's node IP got hijacked by wg0

Once the pod landed on `worker-rasp`, the pod itself looked fine (`Running`, no crash), but `metallb-speaker` on that node started failing its readiness/liveness probes:

```
Warning  Unhealthy  kubelet  spec.containers{speaker}: Readiness probe failed:
Get "http://192.168.1.91:7472/metrics": dial tcp 192.168.1.91:7472: connect: connection refused
```

### Diagnosis

```bash
kubectl get nodes -o wide
```

`worker-rasp`'s `INTERNAL-IP` was `10.10.0.1` — not its real LAN IP (`192.168.1.91`, statically configured in `~/talos/worker-rasp.yaml`). Confirmed with:

```bash
talosctl -n 192.168.1.91 get addresses
```

Two relevant interfaces exist on the node:

```
end0/192.168.1.91/24   ← real LAN interface (Talos static config)
wg0/10.10.0.1/24        ← created by the wireguard pod itself
```

`wireguard` runs with `hostNetwork: true`, so when its container brings up `wg0` (`wg0.conf` sets `Address = 10.10.0.1/24`), that interface is created directly on the **node's real network namespace** — not isolated inside the pod. Talos's kubelet node-IP auto-detection had nothing pinning it to a specific subnet (`nodeIP.validSubnets` was commented out in `worker-rasp.yaml`), so once `wg0` appeared, kubelet started reporting `10.10.0.1` as the node's Kubernetes `InternalIP` instead of `192.168.1.91`. Everything that depends on the node's registered IP for LAN networking then breaks — MetalLB speaker's own health probes, its gossip/leader-election between speakers, and its ARP announcement source IP.

Confirmed the theory by comparing against `worker-prox`: it has a leftover `wg0/10.10.0.1/24` interface too (stale, from when the wireguard pod ran there previously — hostNetwork pods don't reliably tear down interfaces they created on reschedule), yet `worker-prox`'s `InternalIP` stayed correctly at `192.168.1.152`. Reason: `worker-prox.yaml` already had:

```yaml
nodeIP:
    validSubnets:
        - 192.168.1.0/24
```

`worker-rasp.yaml` didn't — same block existed in it, but commented out as an unused template example.

### Fix

Added the same `nodeIP.validSubnets` block to `worker-rasp.yaml`, then applied live:

```bash
talosctl -n 192.168.1.91 apply-config -f worker-rasp.yaml
```

Confirmed fixed:

```bash
kubectl get node worker-rasp -o wide
# INTERNAL-IP back to 192.168.1.91
```

**Lesson:** any node that will ever run a `hostNetwork` pod creating its own interfaces (WireGuard, or anything else doing `ip addr add` on the host) needs `nodeIP.validSubnets` pinned in its Talos machine config — otherwise kubelet's node-IP auto-detection can silently latch onto whatever interface shows up last, breaking MetalLB and anything else that trusts `Node.status.addresses`.

## Part 3 — pod healthy, tunnel handshakes, but NAT/forwarding still broken (interface name mismatch)

After part 1 and 2 were fixed, the pod ran (`1/1 Ready`) and `wg show` inside it showed a real peer handshake with data transferred. Looked like a working tunnel. But — per the user's own testing — it "appears running but doesn't actually work."

### Diagnosis

```bash
kubectl logs -n wireguard <pod>
```

```
[#] iptables -A FORWARD -i wg0 -o ens18 -j ACCEPT
[#] iptables -A FORWARD -i ens18 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
[#] iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o ens18 -j MASQUERADE
```

`wg0.conf`'s `PostUp`/`PostDown` rules hardcode interface `ens18` — that's `worker-prox`'s NIC name (Proxmox VM). `worker-rasp`'s real interface is `end0`. `iptables` doesn't validate that an interface exists when a rule is added, so these rules silently just never match on `worker-rasp`: no FORWARD, no MASQUERADE. The WireGuard handshake itself doesn't depend on this (that's raw UDP on `wg0`, works regardless), which is why the tunnel *looked* healthy — but any traffic a client sends through the tunnel toward the LAN or internet has nowhere to go.

### Fix (confirmed working)

Pulled the config out of the running pod, edited locally, pushed it back:

```bash
kubectl cp wireguard/$POD:/etc/wireguard/wg0.conf ./wg0.conf
# edit locally
kubectl cp ./wg0.conf wireguard/$POD:/etc/wireguard/wg0.conf
kubectl delete pod -n wireguard $POD   # PostUp/PostDown only run on interface up/down, need a restart to re-apply
```

Added a second set of `PostUp`/`PostDown` rules for `end0` alongside the existing `ens18` ones (both in the same line, `;`-separated), so the same `wg0.conf` works unchanged on either node — inert rules for whichever interface doesn't exist on the current node:

```
PostUp = iptables -A FORWARD -i wg0 -o ens18 -j ACCEPT; iptables -A FORWARD -i ens18 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o ens18 -j MASQUERADE; iptables -A FORWARD -i wg0 -o end0 -j ACCEPT; iptables -A FORWARD -i end0 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o end0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -o ens18 -j ACCEPT; iptables -D FORWARD -i ens18 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.10.0.0/24 -o ens18 -j MASQUERADE; iptables -D FORWARD -i wg0 -o end0 -j ACCEPT; iptables -D FORWARD -i end0 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.10.0.0/24 -o end0 -j MASQUERADE
```

**Confirmed** — WireGuard is running on `worker-rasp` with working forwarding/NAT after adding the `end0` rules.

Note this file lives on the `wireguard-longhorn` PVC, not in git — it's not GitOps-managed, so this fix doesn't show up in the `apps/wireguard` repo history. Worth considering moving this into a SOPS-encrypted Secret at some point (already flagged as a follow-up in [wireguard-gitops-drift-not-in-flux.md](./wireguard-gitops-drift-not-in-flux.md)) so it's versioned and this kind of per-node duplication is visible in a diff instead of hidden on a volume.

## Open follow-ups

- Decide whether to keep the `nodeSelector: worker-rasp` test pin or revert to floating/`worker-prox` now that both are confirmed to work.
- Consider a dynamic egress-interface lookup in `PostUp`/`PostDown` instead of hardcoding both `ens18` and `end0` — e.g. `` -o $(ip -4 route show default | awk '{print $5}') `` — so a third node type wouldn't need another manual edit.
- `apps/wireguard/README.md` still claims the pod is pinned via `nodeAffinity`, which has never actually existed in the manifests (noted already in [wireguard-metallb-external-traffic-policy.md](./wireguard-metallb-external-traffic-policy.md)) — worth fixing now that the node-pinning story is settled (works on both nodes).

## See also

- [wireguard-metallb-external-traffic-policy.md](./wireguard-metallb-external-traffic-policy.md) — same app, `externalTrafficPolicy: Local` fix for MetalLB VIP announcement following the pod's node
- [wireguard-gitops-drift-not-in-flux.md](./wireguard-gitops-drift-not-in-flux.md) — same app, GitOps drift history and the note about moving `wg0.conf` off a plain PVC
