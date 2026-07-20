# WireGuard unreachable after router reboot — MetalLB announcing from the wrong node

## What happened

Router rebooted overnight and came back up with a new public IP. The DuckDNS CronJob updated the DNS record correctly (confirmed on duckdns.org), but WireGuard clients still couldn't connect. The pod itself was `Running`, no crash, no restart — just silently refusing new connections. Had to manually delete the WireGuard pod and wait for Kubernetes to recreate it before clients could connect again.

## Diagnosis

### 1. Confirmed DuckDNS was not the problem

Checked duckdns.org — the registered IP matched the router's current WAN IP. DNS resolution was correct. Ruled out (this was the CGNAT scenario in [wireguard-cgnat-after-power-outage.md](./wireguard-cgnat-after-power-outage.md), but not what happened this time — WAN IP was a real public IP, no CGNAT).

### 2. Checked pod/service events

```bash
kubectl -n wireguard get events
```

Found the actual failure signature:

```
Warning  FailedAttachVolume  pod/wireguard-xxxx-nghbn  Multi-Attach error for volume "pvc-..." Volume is already used by pod(s) wireguard-xxxx-8r5fp
Normal   nodeAssigned        service/wireguard         announcing from node "worker-rasp" with protocol "layer2"
Normal   nodeAssigned        service/wireguard         announcing from node "worker-prox" with protocol "layer2"
```

MetalLB had re-elected which node announces the service VIP (`192.168.1.195`), switching from `worker-rasp` to `worker-prox` — independently of which node the WireGuard pod was actually running on.

### 3. Checked the Service traffic policy

```bash
kubectl -n wireguard get svc wireguard -o yaml | grep externalTrafficPolicy
```

```
externalTrafficPolicy: Cluster
```

This was the root cause. `wireguard` runs with `hostNetwork: true` (needed so `wg0` can route traffic to the LAN directly through the node's real interface, not through the CNI overlay). With `externalTrafficPolicy: Cluster` (the default), MetalLB's Layer2 mode can elect **any** node to answer ARP for the service VIP — not necessarily the node the pod is actually on.

When the announcing node differs from the pod's node, incoming UDP has to be DNAT'd cross-node to reach the pod. But because the pod is `hostNetwork`, WireGuard's replies go out directly from the pod's real node IP — not back through the service path. This is asymmetric routing: the home router's NAT table has a conntrack entry expecting the reply to come from `192.168.1.195` (the VIP), but it arrives from a different LAN IP, so the router silently drops it. Result: handshake never completes, looks like the pod is "frozen," even though it's healthy.

Router reboots are exactly the kind of event that can cause MetalLB's memberlist speakers to briefly lose sync and re-elect a different announcing node — which is why this only shows up after a router reboot.

Deleting the pod "fixed" it only by coincidence: the pod got rescheduled onto the same node MetalLB was already announcing from at that moment, realigning the two.

Also noted: `apps/wireguard/README.md` claims the pod is pinned to a fixed node via `nodeAffinity`, but no such affinity exists in the actual manifests — the pod can float freely, making this mismatch more likely to happen. **SOLVED** — see [wireguard-worker-rasp-nodeip-and-postup-nat.md](./wireguard-worker-rasp-nodeip-and-postup-nat.md), confirmed working on both `worker-prox` and `worker-rasp`.

## Fix

Set `externalTrafficPolicy: Local` on the `wireguard` Service. This restricts MetalLB to only announce the VIP from nodes that have a local, healthy endpoint — i.e. it always follows wherever the pod is actually running. No cross-node hop, no asymmetric routing, and no dependency on manually pinning the pod to a node.

`apps/wireguard/overlays/homelab/patch-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: wireguard
  namespace: wireguard
spec:
  type: LoadBalancer
  loadBalancerIP: 192.168.1.195
  externalTrafficPolicy: Local
```

Applied by editing the GitOps repo directly and pushing — Flux reconciles automatically.

### Why not `hostNetwork: false` instead

Considered switching the pod off `hostNetwork` entirely, which would also fix this (the pod would get a normal pod IP and the Service would DNAT/return traffic correctly regardless of which node answers). Rejected because:

- The whole point of this WireGuard pod is routing remote clients into the LAN (`192.168.1.0/24`), not just into the cluster. With `hostNetwork: true`, `wg0` sits directly on the node's real interface — traffic to LAN devices goes out directly, no extra hop.
- With `hostNetwork: false`, that same traffic would need to leave the pod netns, get masqueraded by Cilium as the node's IP, then reach the LAN — an extra NAT hop, and if Cilium encapsulates pod traffic (VXLAN/Geneve), WireGuard's own encrypted tunnel would be double-encapsulated. More latency, more moving parts, unverified without testing LAN reachability end-to-end.
- `externalTrafficPolicy: Local` fixes the actual bug without touching any of this — keeps `hostNetwork: true`, same performance, same direct routing to the LAN.

## Lesson

After a router reboot, if DuckDNS shows the correct IP but WireGuard still won't accept connections:

1. Don't assume it's DNS — check `kubectl -n wireguard get events` first for `FailedAttachVolume` / `nodeAssigned` messages before touching anything.
2. Check `kubectl -n wireguard get svc wireguard -o yaml | grep externalTrafficPolicy` — if it's `Cluster` on a `hostNetwork` pod behind MetalLB Layer2, that's the bug: MetalLB can announce the VIP from a different node than the one running the pod, breaking return routing through the home router's NAT.
3. `externalTrafficPolicy: Local` is the fix for any `hostNetwork` + MetalLB Layer2 service — it ties VIP announcement to wherever the pod actually is, no manual node pinning needed.
4. Deleting the pod is not really "fixing" anything here — it's a coin flip that happens to realign the pod with whatever node MetalLB is currently announcing from. Don't rely on it as the standing workaround.
5. `apps/wireguard/README.md` mentions `nodeAffinity` pinning that doesn't actually exist in the manifests — treat that doc as aspirational until it's fixed or removed. **SOLVED** — see [wireguard-worker-rasp-nodeip-and-postup-nat.md](./wireguard-worker-rasp-nodeip-and-postup-nat.md).

See also [wireguard-gitops-drift-not-in-flux.md](./wireguard-gitops-drift-not-in-flux.md) — same app, a separate incident found while fixing this one (the app was never actually managed by Flux), plus a note on replacing the PVC holding `wg0.conf` with a SOPS-encrypted Secret.
