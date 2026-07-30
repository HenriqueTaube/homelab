# Mempool

Self-hosted [mempool](https://github.com/mempool/mempool) block explorer — frontend + backend, images built from a Forgejo mirror of the upstream repo. `bitcoind` (Knots) and `electrs` are **not** part of this stack — they run outside Kubernetes on the Proxmox Ubuntu VM (see [`infrastructure/knots-bitcoin`](../../infrastructure/knots-bitcoin/README.md)). See the [init runbook](../../runbooks/mempool-kubernetes-init.md) for the full planning history.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `mempool` |
| Frontend image | `192.168.1.191:3000/henrique/mempool-frontend:v3.3.1` (built and pushed) |
| Backend image | `192.168.1.191:3000/henrique/mempool-backend:v3.3.1` (built and pushed) |
| Backend mode | `electrum` (talks to Knots VM's `electrs` on `50001`) |
| Database | MariaDB ≥ 10.5, standalone in-cluster |
| Storage | Longhorn PVC (MariaDB) |
| External IP | `192.168.1.193` (MetalLB LoadBalancer, LAN only) |
| GeoIP | Not used — `MAXMIND.ENABLED: false` (default), node-map feature not needed |

## Building the images

Upstream doesn't publish a Dockerfile at the repo root — `docker/init.sh` stages `docker/backend/*` into `backend/` and `docker/frontend/*` (+ root nginx configs) into `frontend/` before building, and the backend build needs Rust source from a sibling `rust/` directory as a named build context. `image/build-multiarch.sh` reproduces that staging and builds both images. **Confirmed working** end to end for `v3.3.1` (see the [init runbook](../../runbooks/mempool-kubernetes-init.md#build-gotchas-found-the-hard-way) for the gotchas the script works around).

1. **Mirror the repo into Forgejo**: Forgejo → New Migration → GitHub → `https://github.com/mempool/mempool`, set as a pull mirror (public repo, no token needed).
2. **Clone the mirror locally**, as a standalone repo — **not** nested inside `homelab` (that creates a broken nested-git situation): `git clone http://192.168.1.191:3000/henrique/mempool.git ~/projetos/mempool`.
3. **Pick a release tag** to build (check `git tag` for the latest stable `vX.Y.Z` — skip `-dev`/`-rc`/`-alpha` suffixes and don't build `master` directly).
4. **Log Docker into the Forgejo registry once** (separate from git credentials): generate a token in Forgejo → Settings → Applications with `write:package` scope, then `docker login 192.168.1.191:3000 -u henrique` using that token as the password.
5. **Run the build script**:
   ```bash
   cd kubernetes/mempool/image
   MEMPOOL_TAG=v3.3.1 \
   FRONTEND_IMAGE=192.168.1.191:3000/henrique/mempool-frontend \
   BACKEND_IMAGE=192.168.1.191:3000/henrique/mempool-backend \
   sh build-multiarch.sh
   ```
   (`MEMPOOL_REPO` defaults to `~/projetos/mempool`; override it if you cloned elsewhere. Add `PLATFORMS=linux/amd64` to test a single native arch quickly before committing to the full multi-arch build, which takes noticeably longer under QEMU emulation for the non-native platform.)
6. Verify both images landed in the Forgejo package registry before referencing them in the deployment manifests (in the `gitops` repo).

To rebuild on a new upstream release: pull the mirror (or wait for its scheduled sync), re-run steps 3-5 with the new tag.
