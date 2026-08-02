# Mempool — init: self-hosted block explorer in Kubernetes, external Knots node

## Context

**Status: done, running.** Both `platform/mempool-db` and `apps/mempool` are deployed and reconciled by Flux; mempool is reachable at `http://192.168.1.193:8080`.

Goal: run [mempool](https://github.com/mempool/mempool) (frontend + backend) in Kubernetes to browse the Bitcoin blockchain/mempool against a self-hosted node, while `bitcoind` (Knots) and `electrs` keep running where they already do — outside Kubernetes, on the Proxmox Ubuntu VM (see [`infrastructure/knots-bitcoin`](../infrastructure/knots-bitcoin/README.md)). This is mempool's normal topology; nothing about the node needs to move into the cluster.

**Why self-host at all**: looking up addresses/transactions/fees through mempool.space's public site lets a third party correlate those lookups — and the wallet activity behind them — with your IP. Running it against your own node keeps that private.

Actual Kubernetes manifests live in the separate `gitops` repo (`~/gitops`, `github.com/chtaube/gitops`), following the existing `apps/<name>/base` + `overlays` Kustomize pattern (see `apps/forgejo`, `apps/wireguard` for reference). This file just tracks the plan/decisions; the manifests themselves belong in that repo.

## Decisions made

| Decision | Value | Why |
|---|---|---|
| Network exposure | MetalLB LoadBalancer `192.168.1.193` | Free IP in `homelab-pool` (`.190`-`.195`). LAN-only — no public ingress. Reachable from WireGuard clients too, since WireGuard peer traffic is MASQUERADEd onto the LAN before it reaches other LAN/cluster services (see `kubernetes/wireguard/config/wg0.conf`) — no extra firewall rule needed for that. |
| mempool backend mode | `electrum` | User runs plain `romanz/electrs` (Electrum TCP protocol, no TLS, no auth) — not `esplora` (that's for the `mempool/electrs` fork). |
| Database | **Deployed and running.** MariaDB 11.6, standalone in-cluster (`platform/mempool-db` in `gitops`) | mempool's backend is MySQL/MariaDB-only (hardcoded schema/queries) — **no Postgres support**, confirmed against upstream source/issues. Don't try to reuse CloudNativePG (Postgres-only in this cluster) — small dedicated MariaDB (Deployment + Longhorn PVC), same pattern as `forgejo-db`, secret SOPS-encrypted (unlike `forgejo-db`'s, which was applied manually and was never actually in git). `DATABASE.ENABLED: false` is a known-buggy no-op upstream (backend still hits the MySQL socket and errors) — the DB is not actually optional in practice. |
| Container images | **Built via Forgejo, `arm64`-only.** `192.168.1.191:3000/henrique/mempool-{frontend,backend}:v3.3.1` | Mirrored `mempool/mempool` into Forgejo and built with `kubernetes/mempool/image/build-multiarch.sh` — keeps the full supply chain self-hosted, matching the WireGuard image pattern. An `amd64` build was pushed first, then an `arm64` build was pushed to the *same tag* later — this overwrites rather than merges, so the registry now only has `arm64` for `v3.3.1`. Rather than rebuild multi-arch, both Deployments got `nodeSelector: kubernetes.io/hostname: worker-rasp` (baked into `base/`, not the overlay — a minor deviation from the base/overlay-should-be-generic principle, acceptable since this cluster only has the one arm64 node anyway). See [Build gotchas](#build-gotchas-found-the-hard-way) below for what it took to get a working build. |

## bitcoind (Knots) config — done

Applied directly on the Proxmox VM (`/mnt/knots/.bitcoin/bitcoin.conf`); repo copy at [`infrastructure/knots-bitcoin/config/bitcoin.conf`](../infrastructure/knots-bitcoin/config/bitcoin.conf) updated to match.

```conf
server=1
rpcuser=mempool
rpcpassword=<generated — not committed>
rpcallowip=<LAN or k8s node subnet>
rpcbind=0.0.0.0:8332

zmqpubrawblock=tcp://0.0.0.0:28332
zmqpubrawtx=tcp://0.0.0.0:28333
```

- `rpcuser`/`rpcpassword` replace cookie auth for the remote (in-cluster) connection — electrs keeps using the local cookie file, unaffected.
- ZMQ gives mempool real-time new-block/new-tx notifications instead of polling.

## electrs config — no change needed

`electrum_rpc_addr = 0.0.0.0:50001` in `/etc/electrs/config.toml` already listens on all interfaces — nothing to update there.

## Firewall — TODO

Both `8332` (RPC) and `28332`/`28333` (ZMQ) need the same opening already given to electrs' `50001` (electrs has zero auth, so reuse that same trust boundary/CIDR for these too — likely the k8s node IPs or LAN subnet, since pod-to-external traffic gets SNAT'd to the node IP unless the CNI does routed pod networking).

## mempool backend config (for reference, once written)

```json
"CORE_RPC": {
  "HOST": "<knots-vm-lan-ip>",
  "PORT": 8332,
  "USERNAME": "mempool",
  "PASSWORD": "<same as bitcoin.conf>"
},
"ELECTRUM": {
  "HOST": "<knots-vm-lan-ip>",
  "PORT": 50001,
  "TLS_ENABLED": false
},
"MEMPOOL": {
  "BACKEND": "electrum"
},
"DATABASE": {
  "ENABLED": true,
  "HOST": "mempool-mariadb",
  "PORT": 3306,
  "DATABASE": "mempool",
  "USERNAME": "mempool",
  "PASSWORD": "<generate>"
}
```

In-cluster, reach the Knots VM via a Kubernetes `Service` without a selector + manual `Endpoints` (stable DNS name like `bitcoind.mempool.svc.cluster.local`) rather than hardcoding the VM's LAN IP in the backend config — easier to move later.

## Build gotchas (found the hard way)

Building `v3.3.1` from the Forgejo mirror surfaced several issues, all now fixed in `kubernetes/mempool/image/build-multiarch.sh`:

- **Clone location matters.** First attempt added the Forgejo mempool remote *inside* the `homelab` repo and tried `git pull` — merges two unrelated histories, nearly corrupted the docs repo (caught before merge completed; fixed with `git remote remove`). Second attempt cloned nested inside `kubernetes/mempool/image/` — same class of mistake. mempool must be cloned as a **fully separate repo** outside `homelab` (settled on `~/projetos/mempool`, now the script's default).
- **`http-basic.conf` doesn't exist at `v3.3.1`.** It's only referenced by `docker/init.sh` on current `master` — older tags' `init.sh` doesn't stage it. Script no longer copies it.
- **`sync-assets.js` hangs the build indefinitely.** The frontend build calls `api.github.com` to fetch mining-pool logos/promo video with **no request timeout** in the code — if that call can't complete (rate limiting, network path issue), the build hangs forever with the CPU sitting near 0% (confirmed via `docker stats` on the buildx builder container — that's the tell it's hung, not just slow). Fixed by patching `ENV SKIP_SYNC=1` into the staged frontend Dockerfile before `RUN npm run build` (the script has a documented escape hatch for exactly this, just not wired up as a Dockerfile build-arg upstream).
- **Backend Dockerfile still expects a `GeoIP/` directory to exist**, even though we don't download the actual GeoLite2 databases (`MAXMIND.ENABLED: false`, unused). `COPY --from=builder /build/GeoIP ./GeoIP/` fails if the source path is entirely absent. Fixed with `mkdir -p ./backend/GeoIP/` (empty dir) during staging.
- **Docker registry push needs its own login**, separate from the git credential prompt during `git fetch`/`checkout`. Needed a Forgejo token (Settings → Applications, `write:package` scope) and `docker login 192.168.1.191:3000 -u henrique`.
- **Cross-arch builds are slow.** `linux/arm64` on an amd64 host runs under QEMU emulation — the Angular `npm run build` step alone took ~85-90 minutes per platform. Added a `PLATFORMS` override to the script to test single-arch (native, fast) before committing to the full multi-arch run.
- Also needed `sudo usermod -aG docker $USER` + new shell session — the build user wasn't in the `docker` group initially.
- **Neither `npm_package.sh` nor `npm_package_rm_build_deps.sh` are valid shell scripts** — both ship with `#/bin/sh` (missing the `!`), not a real shebang. Works by accident natively (shells retry a failed `ENOEXEC` exec as `/bin/sh scriptname`), but fails outright under QEMU arm64 emulation with `Exec format error`. Script now loops over `./backend/*.sh` fixing any file with this bug during staging, in case a future release adds more.

## Deploy gotchas (gitops repo)

- **`platform/mempool-db` first Flux reconcile failed**: `overlays/homelab/patch-pvc.yaml` had `ApiVersion: v1` (capital `A`) instead of `apiVersion: v1`. YAML/Kubernetes fields are case-sensitive, so Kustomize couldn't identify the patch's target kind at all — error was `no resource matches strategic merge patch ... failed to find unique target`, which reads like a naming/namespace mismatch but was actually just the capitalization typo. Fixed, `platform` Kustomization reconciled successfully, MariaDB pod running.
- **Three more case-sensitivity/naming typos in `apps/mempool`**, all caught by running `kubectl kustomize apps/mempool/overlays/homelab` locally *before* pushing (worth doing every time, cheap and catches exactly this class of bug):
  - `base/kustomization.yaml` listed resources as `secret-backend.yaml`/`deployment-backend.yaml`/etc., but the actual files were named the other way round (`backend-secret.yaml`/`backend-deployment.yaml`/etc.)
  - A stray junk file literally named `\` sitting in `base/` (leftover from a copy-paste mistake)
  - `overlays/homelab/kustomization.yaml` had `apiVersion: kustomize.config.k8s.io/vibeta1` (missing the `1` — "v1beta1" typed as "vibeta1")
  - `overlays/homelab/patch-service-frontend.yaml` had `LoadBalancerIP` (capital `L`) instead of `loadBalancerIP` — this one wouldn't have errored at all, Kubernetes just silently drops unrecognized fields, so MetalLB would've handed out a random pool IP instead of the intended `192.168.1.193`
- **First deploy attempt still failed at runtime**, even with the manifests correct: backend logs showed `Access denied for user 'mempool'@'10.244.2.34' (using password: YES)`. Root cause, found by execing into the `mempool-mysql` pod and testing auth directly: `mysql.user` had no `mempool` user at all — only `henrique`@`%`. The `mysql-user` key in `platform/mempool-db/base/secret.yaml` had been set to `henrique` by mistake for the database's *very first* boot (empty data directory), and the MariaDB image only runs its user/password initialization on that first boot. Correcting the secret afterward had **no effect** on the already-initialized database — the wrong username was permanently baked into the persisted Longhorn volume. Deleting the `mempool-mysql` *Deployment* alone (tried first, via k9s) didn't help either, since the PVC (and the volume behind it) is a separate object that survives and gets reattached unchanged. Actual fix: scale the deployment to 0, `kubectl delete pvc mempool-mysql-longhorn -n mempool`, scale back to 1 — forces MariaDB to re-initialize from the (by then corrected) secret. Safe here only because mempool had never successfully connected, so there was no real data to lose.

## Remaining steps

- [x] Decide: official mempool images vs building via Forgejo — **building via Forgejo**, images pushed
- [x] Confirm `rpcallowip` value applied on the VM — `192.168.1.0/24`, confirmed live on the VM
- [x] Build images — `v3.3.1`, currently `arm64`-only (see the container images decision above), both Deployments pinned to `worker-rasp`
- [x] `platform/mempool-db` written, wired into `clusters/homelab/platform/kustomization.yaml`, MariaDB running
- [x] `apps/mempool` written, wired into `clusters/homelab/apps/kustomization.yaml`, backend/frontend running
- [x] Confirmed reachable at `http://192.168.1.193:8080`
