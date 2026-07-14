# WireGuard was never managed by Flux — repo had silently drifted from reality

## What happened

While fixing the `externalTrafficPolicy` issue (see [wireguard-metallb-external-traffic-policy.md](./wireguard-metallb-external-traffic-policy.md)), pushed the fix to `apps/wireguard/overlays/homelab/patch-service.yaml` and expected Flux to pick it up automatically. It didn't — the live Service kept showing `externalTrafficPolicy: Cluster` no matter how many times Flux reported `ReconciliationSucceeded`.

Turned out WireGuard had been deployed manually a long time ago with `kubectl apply -f` from a local folder (`~/talos/wireguard`), completely outside GitOps. The `apps/wireguard` folder in the gitops repo existed, looked reasonable, but **was never referenced by any Flux Kustomization** — so Flux was never applying it, ever. It had been silently rotting, out of sync with what was actually running in the cluster.

## Diagnosis

### 1. Confirmed the commit was pushed and Flux was at the right revision

```bash
flux events
flux get kustomizations -A
```

Commit was pushed, `GitRepository` was synced to the right SHA, all Kustomizations showed `Ready: True`. Everything *looked* healthy — but the live Service was untouched.

### 2. Rendered the actual manifests Flux applies for `apps`

```bash
cat clusters/homelab/apps/kustomization.yaml
```

```yaml
resources:
  - ../../../apps/cloudflare/overlays/homelab
  - ../../../apps/duckdns/overlays/homelab
  - ../../../apps/forgejo/overlays/homelab
  - ../../../apps/orcamentos/overlays/homelab/
```

**No `wireguard` in the list.** Flux's `apps` Kustomization had no idea `apps/wireguard` existed. Reconciliation was "succeeding" because from Flux's point of view there was nothing wrong — it simply wasn't looking at that folder at all.

### 3. Added it to the resource list — and everything broke

```yaml
resources:
  - ../../../apps/cloudflare/overlays/homelab
  - ../../../apps/duckdns/overlays/homelab
  - ../../../apps/forgejo/overlays/homelab
  - ../../../apps/orcamentos/overlays/homelab/
  - ../../../apps/wireguard/overlays/homelab
```

The moment Flux actually applied `apps/wireguard` for the first time, it exposed how far the repo had drifted from the real, manually-managed deployment:

- **`FailedCreate ... violates PodSecurity "baseline:latest"`** — the `wireguard` namespace had been manually labeled `pod-security.kubernetes.io/enforce=privileged` at some point (required for `hostNetwork`, `NET_ADMIN`, `hostPort`), but that label was never committed to `base/namespace.yaml`. Flux took ownership of the `Namespace` object using the unlabeled git version, wiping the manual label, and the baseline policy started rejecting new pods.
- **`PersistentVolumeClaim/wireguard/wireguard-data created`** — the deployment in git mounted a PVC named `wireguard-data`, but the *actual* data-bearing volume in the cluster (private keys, peer configs) was a different PVC, `wireguard-longhorn`, created during a manual Longhorn migration done previously. The manifests for that migration (`pvc-longhorn.yaml`, a scratch `pod-temporary-sh.yaml`) existed loose in `apps/wireguard/overlays/` but were **never wired into any `kustomization.yaml`** — so git still pointed at the old, pre-migration PVC name. Flux created a brand-new **empty** `wireguard-data` PVC and pointed the Deployment at it. If PodSecurity hadn't blocked pod creation first, the pod would have come up with zero WireGuard config.

### 4. Compared against the manually-applied folder to find every diff

The folder used for the original `kubectl apply -f`, `~/talos/wireguard`, was the ground truth for "what's actually running." Diffed it field by field against `apps/wireguard` in git:

| File | Git (wrong) | Real (`~/talos/wireguard`) |
|---|---|---|
| `deployment.yaml` volumes | `claimName: wireguard-data` | `claimName: wireguard-longhorn` |
| `namespace.yaml` | no labels | `pod-security.kubernetes.io/enforce=privileged` (+ audit/warn) |

## Fix

1. Added the PodSecurity privileged labels to `apps/wireguard/base/namespace.yaml` (same recipe as [longhorn-podsecurity.md](./longhorn-podsecurity.md)):

   ```bash
   kubectl label namespace wireguard \
     pod-security.kubernetes.io/enforce=privileged \
     pod-security.kubernetes.io/enforce-version=latest \
     pod-security.kubernetes.io/audit=privileged \
     pod-security.kubernetes.io/audit-version=latest \
     pod-security.kubernetes.io/warn=privileged \
     pod-security.kubernetes.io/warn-version=latest \
     --overwrite
   ```

2. Moved `apps/wireguard/overlays/pvc-longhorn.yaml` into `overlays/homelab/` and added it to that kustomization's `resources:`.
3. Removed `wireguard-data` entirely: deleted `base/pvc.yaml` (and its entry in `base/kustomization.yaml`), deleted `overlays/homelab/patch-pvc.yaml` (and its entry in `overlays/homelab/kustomization.yaml`).
4. Patched the Deployment's `volumes` in `overlays/homelab/patch-deployment.yaml` to point at `claimName: wireguard-longhorn` instead.
5. Left `pod-temporary-sh.yaml` (the old migration scratch pod) out of every `kustomization.yaml` — it already did its job, no reason to ever apply it again.
6. Validated the full render before pushing:

   ```bash
   kubectl kustomize apps/wireguard/overlays/homelab
   ```

7. Pushed, let Flux reconcile, then deleted the orphaned empty PVC:

   ```bash
   kubectl -n wireguard delete pvc wireguard-data
   ```

After this, `wireguard` pod came up `Running`, mounted on `wireguard-longhorn` (the real data), Service showing `externalTrafficPolicy: Local`.

## Lesson

**If an app's folder isn't referenced in a `resources:` list under `clusters/homelab/*/kustomization.yaml`, Flux is not managing it — no matter how correct or polished the manifests look, and no matter how many green `ReconciliationSucceeded` events show up.** Those events only reflect the resources Flux actually knows about.

Any `kubectl apply -f` or live cluster edit that isn't reflected back into git will silently rot the corresponding folder in the repo. The drift is invisible until the day someone finally wires that folder into Flux — at which point it can silently apply years-old, wrong config over a working production service (wrong PVC, missing security labels, etc.), with no warning beyond "Reconciliation finished."

Before adding any existing-but-unmanaged app to a Flux Kustomization:

1. Check whether it was ever deployed manually (`kubectl apply -f` from some local folder) and, if so, diff that folder against git field by field — don't assume the git copy reflects reality.
2. Render the overlay locally first and read every line: `kubectl kustomize apps/<app>/overlays/homelab`.
3. Watch `kubectl -n <ns> get events --sort-by='.lastTimestamp'` immediately after the first real reconcile — that's where drift-induced bugs surface (`FailedCreate`, `FailedAttachVolume`, wrong PVC bound, etc).

## Considered and rejected — replacing the PVC with a SOPS-encrypted Secret

Considered moving `wg0.conf` off the `wireguard-longhorn` PVC and into a SOPS-encrypted Secret (same pattern as `apps/duckdns/overlays/homelab/secret.yaml`), so peer/key changes would be tracked in git instead of being a live edit inside the pod.

Decided against it: the drift that caused this incident was the app not being referenced in any Flux Kustomization at all — not the PVC itself. Now that `wireguard-longhorn` is properly declared in git (`pvc-longhorn.yaml`, wired into `overlays/homelab/kustomization.yaml`), the object is git-managed like any other; only its *contents* are opaque to git, same as any stateful volume (no different from a database's data directory). A Secret would also break the current peer-management workflow ("exec into the pod, edit the config, restart it" — works today because the edit lands on a PVC that survives the restart; a Secret-backed volume would discard that edit on the next restart), adding `sops` friction to every peer change for a home VPN where peer changes are rare. Not worth it without a concrete need driving it.
