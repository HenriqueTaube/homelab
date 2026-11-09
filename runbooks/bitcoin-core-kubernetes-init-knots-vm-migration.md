# Bitcoin Core — init: full node in Kubernetes, replacing the Knots node on the Proxmox Ubuntu VM

> Follow-up to [Mempool — init](./mempool-kubernetes-init.md), which ran mempool against `bitcoind` Knots + electrs on a Proxmox Ubuntu VM. That VM is now **shut down**. The node runs as `apps/bitcoin-core` in the cluster instead, on Bitcoin Core v29.5, with its own 2 TB disk on `worker-prox`.

## Context

**Status: running, initial sync (IBD) in progress.** The pod is `Running` on `worker-prox`, Flux reconciles it, and volume, network and memory have been checked (2026-11-09). There are still follow-ups after the IBD and for the services that used the old VM (mempool, electrs, Electrum wallet). See [Follow-ups](#follow-ups).

Two changes happened together:

1. **Client: Bitcoin Knots → Bitcoin Core v29.5.** Knots stopped being a safe choice for the main chain in 2026 (see [Why leave Knots](#why-leave-knots)).
2. **Where it runs: Ubuntu VM on Proxmox → Kubernetes (Talos), managed by GitOps.** It is now managed like the rest of the homelab (Flux, SOPS, Longhorn, Alloy → Loki), not by hand on a VM.

The old Knots data was **not migrated**. The disks were wiped and the new node is syncing the chain from scratch.

Manifests live in the `gitops` repo (`github.com/HenriqueTaube/gitops`, branch `master`) under `apps/bitcoin-core/`, applied by Flux in the `apps` layer.

## Why leave Knots

Research done on 2026-11-04. Sources are third-party (the KnotsLegacy fork README and the freedom.tech blog), not official announcements.

- **May 2026:** Knots releases **after `v29.3.knots20260507`** started enforcing **BIP-110**.
- **2026-08-08:** BIP-110 did not activate. Knots nodes enforcing it followed a minority chain that made 1–2 blocks and **stalled near block 961,639**.
- After that, mainline Knots moved to a **hard fork with BLAKE2b PoW** and is **no longer maintained for the main chain** (release 29.4.2 has a `difficulty_blake2b` field and a 45-day coinbase maturity).
- A community fork, **Knots Legacy** (`github.com/DimiH2025/KnotsLegacy`), continues from `v29.3.knots20260507`. It is small and has little review.

Rule of thumb:

| Knots version | Main chain? | Notes |
|---|---|---|
| ≤ `20260507` | ✅ | No more security fixes |
| > `20260507` | ❌ | Enforces BIP-110 or follows the BLAKE2b fork |

**Never update Knots through the official channel** (bitcoinknots.org / Knots GitHub): the node leaves the main chain.

### Checking which chain a node is on

```bash
bitcoin-cli --version                                         # CLI version
bitcoin-cli getnetworkinfo | grep -E '"version"|subversion'   # running daemon (the one that matters)
bitcoin-cli getblockchaininfo | grep -E '"blocks"|"headers"|verificationprogress'

# Main chain tip — compare with "blocks"
curl -s https://mempool.space/api/blocks/tip/height
curl -s https://blockstream.info/api/blocks/tip/height
```

- `blocks` == `headers` == explorer height → synced and on the main chain.
- Stuck near **961,639** → on the BIP-110 chain. Electrum will show wrong balances and confirmations. Fix with `-reindex-chainstate` or a resync on a correct client.

The old node was checked before the switch (2026-11-04): `v29.3.knots20260210` (pre-BIP-110), `blocks`/`headers` = 974537, the same as both explorers. **It was on the main chain**, so the wallet data it served was correct.

## Decisions made

### Client and version

| Option | Main chain? | Maintained? | Verdict |
|---|---|---|---|
| Knots > 20260507 | ❌ | Only for the fork | Rejected |
| Stay on Knots 20260210 | ✅ | ❌ | Works, but a dead end |
| Knots Legacy | ✅ | Small project | Means trusting a new maintainer |
| **Bitcoin Core 29.x** | ✅ | Yes (29.5 released 2026-10-28) | **Chosen** |
| Bitcoin Core 30+ | ✅ | ✅ | Recommended at the time; OP_RETURN default changed, can be reverted with config |

- **Chosen: Bitcoin Core v29.5 with `datacarriersize=83`.**
- In v30.0 (Oct 2025) the `datacarriersize` default went from **83 to 100,000 bytes**, and multiple OP_RETURN outputs per transaction became standard. This is **mempool/relay policy, not consensus**. It changes what the node relays and keeps in its mempool. It does not change which blocks are valid or how safe the wallet is.
- `datacarriersize=83` keeps the old behaviour on any version. The option is marked deprecated but **still exists in v32.1** (checked in `src/init.cpp` at tag v32.1).
- v29 is the oldest line still maintained. **Plan the move to v30+ before it reaches end of life** (https://bitcoincore.org/en/lifecycle/), keeping `datacarriersize=83`.

Available versions on 2026-11-04: 32.1, 31.2, 30.4 and 29.5 (all released 2026-10-28).

### Image

`bitcoin/bitcoin:29.5` from Docker Hub, built from https://github.com/willcl-ark/bitcoin-core-docker (Will Clark, a Core contributor). **It is not an official Bitcoin Core project image.** The Dockerfile downloads the official binaries and only builds if **at least 6 Core builder signatures** (guix.sigs) are valid.

Checked in the image's Dockerfile: Debian bookworm-slim, user `bitcoin` **UID/GID 101**, datadir `/home/bitcoin/.bitcoin`, `PATH=/opt/bitcoin-29.5/bin`, ports 8332 (RPC) and 8333 (P2P).

### Requirements set during the work

- Run **only on `worker-prox`, never on `worker-rasp`**.
- Data only on the dedicated 2 TB disk. No sharing with `hd-barracuda` or the Pi's SSD.
- **The node does not serve peers to the internet.** No inbound connections from outside, only outbound.
- RPC with plain `rpcuser`/`rpcpassword`, as on Knots.
- Logs on stdout only, collected by **Alloy → Loki**.

## Environment

| Item | Value |
|---|---|
| Node | `worker-prox`: VM 108 on Proxmox, `192.168.1.152`, amd64, 11.3 GiB RAM, Talos v1.12.6 |
| Data disk | ~2 TB passed through to VM 108 on slot **`scsi3`** → `/dev/sdd` in the VM, 1,954,210,119,680 bytes (~1820 GiB) |
| Other data disk on the node | `sdb` = `drive-scsi2`, 500 GB, Longhorn `hd-barracuda` on `/var/mnt/longhorn` |
| Longhorn | 1.11.1, `storage-minimal-available-percentage=25` |
| Old node | Ubuntu VM on Proxmox, Knots `v29.3.knots20260210` + electrs, data on `/mnt/knots` (LVM `vg_knots-lv_knots` on the host). **Shut down** |

## Architecture

```
Proxmox host
└─ ~2 TB disk (passthrough by /dev/disk/by-id, backup=0) ──► VM 108 (worker-prox), slot scsi3
                                                              │
Talos worker-prox                                             ▼
└─ UserVolumeConfig "bitcoin" (xfs) ──► /var/mnt/bitcoin
                                                              │
Longhorn                                                      ▼
└─ disk "ssd-bitcoin"  path=/var/mnt/bitcoin  tag=bitcoin
    └─ StorageClass longhorn-bitcoin (1 replica, strict-local, diskSelector=bitcoin)
        └─ volume 1300Gi (ext4 -m 0) ── PVC bitcoin-core-data ──► /home/bitcoin/.bitcoin
            └─ Deployment bitcoin-core (bitcoind as UID 101, pinned to worker-prox)
                ├─ Service ClusterIP bitcoin-core.bitcoin-core.svc (RPC 8332, P2P 8333)
                └─ outbound P2P only (~10 outbound peers, 0 inbound)
```

## Procedure

### 1. Proxmox: attach the disk to VM 108

```bash
lsblk -o NAME,SIZE,MODEL,SERIAL,FSTYPE           # identify the disk, check the serial
wipefs -a /dev/sdX && sgdisk --zap-all /dev/sdX   # the disk must be EMPTY (this erases it)
qm set 108 --scsi3 /dev/disk/by-id/ata-<MODEL>_<SERIAL>,backup=0
```

- `backup=0`: vzdump does not copy 2 TB of blockchain.
- Pass through by `by-id`, not `/dev/sdX`, so the link doesn't depend on device order.
- The old Knots data was erased here on purpose. Re-syncing was accepted instead of migrating Knots' datadir.

### 2. Talos: declare the volume

Talos has no shell or `mkdir`. The mount comes from a `UserVolumeConfig` in the machine config, and Talos always mounts it at `/var/mnt/<name>`.

```yaml
apiVersion: v1alpha1
kind: UserVolumeConfig
name: bitcoin
provisioning:
  diskSelector:
    match: "'/dev/disk/by-id/scsi-0QEMU_QEMU_HARDDISK_drive-scsi3' in disk.symlinks"
  minSize: 1800GiB
  grow: true
filesystem:
  type: xfs
```

- The selector matches the **VM slot `scsi3`**, not the disk serial. If the disk is replaced, an empty disk on the same slot is formatted and mounted automatically (same as the `scsi2` swap in [the Longhorn disk replacement runbook](./longhorn-disk-replacement-worker-prox-and-rasp-usb-ssd-reset.md)).
- `minSize` prevents formatting the wrong disk: if the selector matches a smaller disk, Talos does not create the volume.

Identify the disk, then apply:

```bash
talosctl -n 192.168.1.152 get disks
talosctl -n 192.168.1.152 get disks sdd -o yaml | grep -A6 symlinks

cd ~/gitops/bootstrap/talos/clusterconfig
talosctl -n 192.168.1.152 apply-config -f worker-prox.yaml --dry-run   # the diff must show ONLY the new UserVolumeConfig
talosctl -n 192.168.1.152 apply-config -f worker-prox.yaml
# → "Applied configuration without a reboot"
```

- **No reboot needed.**
- If the dry-run shows other changes (IP, hostname, certificates, Kubernetes version), the local file is out of date. Apply only the new document with `talosctl -n 192.168.1.152 patch mc --patch @file.yaml`.
- **`clusterconfig/*.yaml` is in `.gitignore`** because it holds cluster secrets (certificates and keys). CI/CD does not apply it, so the change only takes effect when applied by hand with `talosctl`. **Never `git add -f` these files.** Keep a backup of `clusterconfig/` outside Git.

Check:

```bash
talosctl -n 192.168.1.152 get volumestatus u-bitcoin
talosctl -n 192.168.1.152 get mountstatus | grep bitcoin
talosctl -n 192.168.1.152 logs controller-runtime | grep -i -E 'bitcoin|sdd' | tail -20
```

**Gotcha: `get volumestatus u-bitcoin` returned `NotFound` right after the apply.** It was not an error. Talos was still formatting the disk:

| Time (UTC) | `controller-runtime` log |
|---|---|
| 23:48:18 | partition `sdd1` created (label `u-bitcoin`), `formatting filesystem ... xfs` |
| 23:50:03 | `volume status ... waiting -> ready` |
| 23:50:04 | `mounting "/dev/sdd1" to "/var/mnt/bitcoin"` |

Formatting 2 TB as xfs takes **~2 minutes**. Wait and read the logs **before** reaching for `talosctl wipe disk`. If the volume never appears, check `talosctl get discoveredvolumes`: old partitions or signatures (lvm2, ext4, zfs) block provisioning. Fix with `talosctl -n 192.168.1.152 wipe disk sdd` (**erases everything**; confirm the disk first).

Also: `talosctl volumestatus` does not exist; the command is `talosctl get volumestatus`.

### 3. Longhorn: dedicated disk with a tag

```bash
kubectl -n longhorn-system patch nodes.longhorn.io worker-prox --type merge -p \
'{"spec":{"disks":{"ssd-bitcoin":{"path":"/var/mnt/bitcoin","allowScheduling":true,"storageReserved":53687091200,"diskType":"filesystem","tags":["bitcoin"]}}}}'
```

### 4. gitops: `apps/bitcoin-core`

| File | Content / decision |
|---|---|
| `base/namespace.yaml` | Namespace `bitcoin-core`, Pod Security `baseline` (no privileged labels) |
| `base/configmap.yaml` | `bitcoin.conf` (below) |
| `base/pvc.yaml` | `bitcoin-core-data`, RWO, **1300Gi** |
| `base/deployment.yaml` | 1 replica, `Recreate`, `bitcoin/bitcoin:29.5`, `command: bitcoind`, TCP probes on the RPC port, `terminationGracePeriodSeconds: 300`, memory 4Gi request / 5Gi limit, no CPU limit |
| `base/service.yaml` | ClusterIP, ports `rpc` 8332 and `p2p` 8333 |
| `overlays/homelab/storageclass.yaml` | StorageClass `longhorn-bitcoin` |
| `overlays/homelab/patch-pvc.yaml` | `storageClassName: longhorn-bitcoin` |
| `overlays/homelab/patch-deployment.yaml` | `nodeSelector: worker-prox`, securityContext (UID/GID 101), volumes |
| `overlays/homelab/secret.yaml` | Secret `bitcoin-core-rpcauth`, key `rpcauth.conf` with `rpcuser=`/`rpcpassword=`, **SOPS-encrypted** |
| `README.md` | App documentation |
| `clusters/homelab/apps/kustomization.yaml` | Added `- ../../../apps/bitcoin-core/overlays/homelab` |

**StorageClass `longhorn-bitcoin`:**

```yaml
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: Retain
volumeBindingMode: Immediate
parameters:
  dataEngine: v1
  numberOfReplicas: "1"
  dataLocality: strict-local
  diskSelector: "bitcoin"
  disableRevisionCounter: "true"
  fsType: ext4
  mkfsParams: "-m 0"
  staleReplicaTimeout: "30"
  unmapMarkSnapChainRemoved: ignored
```

**`bitcoin.conf` (ConfigMap):**

```conf
server=1
printtoconsole=1
nodebuglogfile=1
disablewallet=1
datacarrier=1
datacarriersize=83
dbcache=3000          # IBD; back to 1000 afterwards
maxmempool=300
maxconnections=40
rpcbind=0.0.0.0
rpcallowip=127.0.0.1
rpcallowip=10.0.0.0/8
includeconf=/etc/bitcoin-secret/rpcauth.conf   # rpcuser/rpcpassword from the SOPS secret
```

Always render locally before pushing (lesson from [mempool](./mempool-kubernetes-init.md#deploy-gotchas-gitops-repo)):

```bash
kubectl kustomize apps/bitcoin-core/overlays/homelab
```

The whole `apps` layer was rendered with every app (32 resources, no name conflicts) before the push.

### Why it's built this way

**Storage**

1. **A dedicated StorageClass, not `longhorn-2`.** The first manifests used `longhorn-2` (2 replicas). That **would never have created the volume**: there are only 2 storage nodes and the Pi's disk is 120 GB. Hence 1 replica + `diskSelector: "bitcoin"`.
2. **The StorageClass lives in the app folder, not `infrastructure/longhorn`.** It belongs to bitcoin, not to Longhorn, so it sits in `apps/bitcoin-core/overlays/homelab/` (same precedent as `platform/cloudnativepg`). It's in the overlay because the disk and tag are homelab-specific. Rule: a StorageClass for a single app goes in that app's folder; only shared classes go in `infrastructure/longhorn`. Side effect accepted: if the app is removed from Flux, prune deletes the StorageClass too. The data stays because of `Retain`.
3. **`strict-local`**: the replica sits on the same node as the pod, with no network hop in the I/O path, so the IBD is faster. Requires `numberOfReplicas: "1"`.
4. **`reclaimPolicy: Retain`**: deleting the PVC or a Flux prune does not delete the chain (a re-sync takes days).
5. **No manual PV.** Longhorn provisions the PV from the PVC. Manual PVs are only for static classes like `cloudnativepg-local`.
6. **PVC size 1300Gi, not 2 TB or 1400Gi.** Longhorn UI for the disk: max **1819.11 Gi**, reserved 30 Gi, usable 1789.11 Gi, used 34.93 Gi (filesystem metadata). Longhorn requires 25% of max (455 Gi) to stay free after the replica is allocated, so the most that fits is ≈ **1329 Gi**. **1400Gi would stay `Pending`** unless the **global** setting is lowered to 20%, which also affects the 500 GB HDD and the Pi's USB SSD. 1300Gi was kept: the chain is ~800 GB and grows ~80–100 GB/year, which gives about 5 years, and the volume can be expanded.
   - Why Longhorn wants 25% free: thin volumes grow over time, snapshots take space beyond the nominal size, rebuilds need room, and a 100% full disk sends the volume to `faulted`. With 1 replica that can mean a corrupted database and a `-reindex`.
7. **ext4 with `mkfsParams: "-m 0"`.** The volume's filesystem (set by Longhorn) is separate from the host's (`/var/mnt/bitcoin`, xfs, formatted by Talos). For bitcoind, ext4 and xfs perform the same. ext4 matches `longhorn-2` and has mature recovery after power outages (which have happened in this homelab). `-m 0` removes the 5% root reserve (≈65 Gi of 1300Gi) that bitcoind (UID 101) could never use. It only applies when the volume is created.

**Deployment**

8. **The image entrypoint (`/entrypoint.sh` + `gosu`) is skipped.** It starts as root, runs `chown -R` on the datadir on every start (slow on 1.3 TB), then drops to the `bitcoin` user with `gosu`. `runAsNonRoot: true` blocks containers that start as root, so the deployment uses `command: bitcoind` and runs directly as 101. Volume permissions come from `fsGroup: 101` with `fsGroupChangePolicy: OnRootMismatch` (applied once).
9. **Hardening:** `runAsNonRoot`, `runAsUser/Group 101`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`. Passes `baseline` and also `restricted`.
10. **`terminationGracePeriodSeconds: 300`.** On SIGTERM bitcoind flushes `dbcache` to disk. The default 30s can cut that short with SIGKILL, corrupting the chainstate and forcing a `-reindex` that takes days.
11. **`strategy: Recreate` + 1 replica**, because the volume is RWO.
12. **`nodeSelector: kubernetes.io/hostname: worker-prox`, without the fast-failover tolerations** other apps (forgejo etc.) use. No other node has the data, so failover makes no sense. If worker-prox goes down, bitcoin-core goes down with it. Accepted: the chain can be downloaded again and there is no backup.
13. **TCP probes on the RPC port.** bitcoind opens the RPC port early ("warming up") before loading the chain, so probes pass during the IBD. The startup probe allows up to 10 minutes.
14. **Memory / dbcache.** worker-prox has 11.3 GiB total, ~3.47 GiB in use before the deploy. IBD with `dbcache=3000` and **4Gi request / 5Gi limit** leaves ~3 GiB free on the node. The request was raised too so the scheduler reserves the RAM.

**Network**

15. **ClusterIP Service, no LoadBalancer IP.** The MetalLB pool (`.190–.195`) is full, and RPC should not be exposed on the LAN.
16. **The node does not serve peers to the internet** (explicit decision). Nothing exposes 8333 outside the cluster: no LoadBalancer, no router port forward. `listen=1` stays on (default) so a future in-cluster **electrs** can fetch blocks over P2P 8333.
17. **RPC security in 3 layers:** ClusterIP Service, `rpcallowip` (localhost and the pod network `10.0.0.0/8` only), and credentials.

**Logs**

18. `printtoconsole=1` + `nodebuglogfile=1`: stdout only, collected by Alloy into Loki. No `debug.log` growing on the volume.

## Timeline

| When (UTC) | Event |
|---|---|
| 2026-11-04 | Knots situation researched; old node confirmed on the main chain (974537). Decision to leave Knots |
| 2026-11-04/05 | ~2 TB disk attached to VM 108 as `scsi3`, `UserVolumeConfig` applied, xfs formatted and mounted on `/var/mnt/bitcoin` (~2 min) |
| 2026-11-05 | Longhorn disk `ssd-bitcoin` (tag `bitcoin`) added. First manifests generated with `longhorn-2` and a 1Ti PVC. Dedicated StorageClass created |
| 2026-11-09 | StorageClass moved into the app folder. File-by-file review: PVC 1Ti → 1300Gi, `mkfsParams: "-m 0"`, `dbcache` 1000 → 3000, memory 2Gi/4Gi → 4Gi/5Gi, `nodebuglogfile=1`, README note on not serving peers |
| 2026-11-09 | App added to `clusters/homelab/apps/kustomization.yaml`, `apps` layer rendered, **push** |
| 2026-11-09 ~13:05 | PVC `Bound` (the first `FailedScheduling` was just the wait for the volume). Pod scheduled on worker-prox, image pulled (60 MB) |
| 2026-11-09 13:07 | **CrashLoopBackOff**: `Invalid -rpcauth argument` (below) |
| 2026-11-09 | Secret switched from `rpcauth=` to `rpcuser=`/`rpcpassword=` via `sops`, push, `rollout restart` |
| 2026-11-09 13:28 | Pod `Running`, IBD started (`UpdateTip ... height=109264 ... progress=0.000201`) |
| 2026-11-09 | Flux, volume, network and memory checked: all OK. Knots VM shut down |

## Incident: `Invalid -rpcauth argument` (CrashLoopBackOff)

**Symptom** right after the deploy:

```
Warning  BackOff  kubelet  Back-off restarting failed container bitcoind in pod bitcoin-core-57dbc65645-lr8hn
```

**Diagnosis:**

```bash
kubectl -n bitcoin-core logs deploy/bitcoin-core --previous --tail=50
```

(Without `deploy/...` the command fails: `logs` needs a pod name or `TYPE/NAME`.)

```
Included configuration file /etc/bitcoin-secret/rpcauth.conf
Config file arg: rpcauth=****
Binding RPC on address 0.0.0.0 port 8332
Generated RPC authentication cookie /home/bitcoin/.bitcoin/.cookie
Using rpcauth authentication.
Invalid -rpcauth argument.
[error] Unable to start HTTP server. See debug log for details.
Shutdown: done
```

The log also showed what **was** working: the config and the secret were read (`includeconf` OK), and the cookie was written to the datadir, so **volume permissions (fsGroup 101) were correct**. Only the `rpcauth` line was bad.

**Cause.** The secret had the password directly (`rpcauth=<password>`). `rpcauth` expects `rpcauth=<user>:<32-hex salt>$<64-hex hash>`, the **hash** generated by `share/rpcauth/rpcauth.py`, not the password.

**Fix.** Use the plain format, as on Knots:

```yaml
stringData:
  rpcauth.conf: |
    rpcuser=electrs
    rpcpassword=<password>
```

```bash
sops apps/bitcoin-core/overlays/homelab/secret.yaml   # edits decrypted, re-encrypts on save
git push
kubectl -n bitcoin-core rollout restart deploy/bitcoin-core
```

A plaintext password is acceptable here: the file is SOPS-encrypted in Git (the repo is public) and is only mounted inside the pod.

**Consequences (documented in the app README):**

- **No `#` in the password.** In `bitcoin.conf` it starts a comment and silently cuts the value.
- With `rpcpassword` set, **bitcoind does not create `.cookie`**. `bitcoin-cli` in the pod must read the config:
  ```bash
  kubectl -n bitcoin-core exec deploy/bitcoin-core -- bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getblockchaininfo
  ```
- The secret key is still named `rpcauth.conf` even though it holds `rpcuser`/`rpcpassword`, because `includeconf` points to that file.

## Verification

```bash
flux get kustomizations                                  # apps Ready True
kubectl -n bitcoin-core get pvc,pod -o wide              # PVC Bound, pod Running on worker-prox

# Volume on the right disk, 1 replica, strict-local
kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,SIZE:.spec.size,REPLICAS:.spec.numberOfReplicas,LOCALITY:.spec.dataLocality,NODE:.status.currentNodeID,STATE:.status.robustness
kubectl -n longhorn-system get replicas.longhorn.io -o custom-columns=VOLUME:.spec.volumeName,NODE:.spec.nodeID,DISK:.spec.diskPath

# No 5% reserve (Used + Avail ≈ Size, ~1.3T)
kubectl -n bitcoin-core exec deploy/bitcoin-core -- df -h /home/bitcoin/.bitcoin

# Outbound only (connections_in 0, connections_out ~10). Also tests the RPC login
kubectl -n bitcoin-core exec deploy/bitcoin-core -- bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getnetworkinfo | grep -E '"connections'

# Memory during IBD (~3.5–4.5 GiB is fine; close to 5 GiB = OOMKilled risk)
kubectl -n bitcoin-core top pod

# Sync progress — and once done, compare "blocks" with mempool.space / blockstream.info
kubectl -n bitcoin-core exec deploy/bitcoin-core -- bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getblockchaininfo | grep -E '"blocks"|"headers"|verificationprogress|initialblockdownload'

# Version actually running (expect /Satoshi:29.5.0/)
kubectl -n bitcoin-core exec deploy/bitcoin-core -- bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getnetworkinfo | grep subversion
```

## Follow-ups

**After the IBD**

- [ ] When `"initialblockdownload": false`: `dbcache=3000` → `1000` in `configmap.yaml`, memory `4Gi/5Gi` → `2Gi/4Gi` in `deployment.yaml`, push, then `kubectl -n bitcoin-core rollout restart deploy/bitcoin-core` (a changed ConfigMap doesn't restart the pod by itself).
- [ ] If the pod gets `OOMKilled` during the IBD: lower `dbcache` to ~2500.

**Services that depended on the old VM** (they lost their backend when the VM was shut down)

- [ ] **electrs**: create it as an app, pointing at `bitcoin-core.bitcoin-core.svc` (RPC 8332 with `rpcuser=electrs` + password; P2P 8333). It needs **1 MetalLB IP** for wallets (Electrum protocol is plain TCP, so Traefik can't front it): grow the pool (e.g. `.196`) or free one of the conflicting `.193`/`.194`.
- [ ] **Electrum wallet**: point it at the new electrs once it exists. Wallets connect to electrs (50001/50002), never directly to bitcoind RPC.
- [ ] **mempool**: repoint `apps/mempool` (`service-knots.yaml` / `endpoints-knots.yaml`) to `bitcoin-core.bitcoin-core.svc:8332` and to the new electrs. The mempool backend runs in `electrum` mode, so it needs electrs (or `txindex=1`). The Knots node also published ZMQ (`zmqpubrawblock`/`zmqpubrawtx`) for mempool; the new `bitcoin.conf` doesn't, so add it if mempool should keep real-time updates.
- [ ] Decide what to do with the stopped Knots VM (delete it, or keep it for a while) and update [`infrastructure/knots-bitcoin`](../infrastructure/knots-bitcoin/README.md) to say it's retired.

**Maintenance**

- [ ] **Plan v29 → v30+** before v29 reaches end of life, keeping `datacarriersize=83`.
- [ ] Align `talosctl` client and server (1.13.8 vs 1.12.6). Reads work; for `apply-config` use a matching client or upgrade the node.

**To confirm**

- [ ] The real `minSize` in `worker-prox.yaml`: notes from different sessions say `1700GiB` and `1800GiB` (`1800GiB` was the one dry-run and applied).
- [ ] What the ~2 TB disk physically is. The Talos notes describe a single 2 TB SSD; the other notes describe the two 1 TB SSDs that held the Knots data (LVM `vg_knots` on the host: CT1000BX500 + Kingston SA400 960G) re-presented as one ~2 TB volume. The reported size (~1954 GB) matches the second. Record model/serial and the host device.
- [ ] Whether the kubelet `extraMounts` bind for `/var/mnt/bitcoin` was needed.
- [ ] Final `storageReserved` on `ssd-bitcoin` (patch used 50 GiB, UI showed 30 Gi reserved).
- [ ] **Exclusivity of the disk:** volumes **without** a `diskSelector` (e.g. `longhorn-2`) can still land on tagged disks. To keep `ssd-bitcoin` for bitcoin only, tag `hd-barracuda` and set a `diskSelector` on `longhorn-2`.
- [ ] No Longhorn RecurringJob snapshots this volume (`kubectl -n longhorn-system get recurringjobs.longhorn.io`). Snapshots of a 1.3 TB chain eat space quickly. Also leave it out of the NFS backup.

## Lessons

1. **Check which chain your node is on, not just whether it's synced.** Compare `blocks` with two public explorers. A node on a dead fork looks "synced" to itself.
2. **Relay policy (`datacarriersize`) is not consensus.** You can run a newer Core and keep the old OP_RETURN limit with one config line.
3. **`rpcauth` ≠ password.** `rpcauth` takes the hash line from `rpcauth.py`; the password goes in the client. If you want simple, use `rpcuser`/`rpcpassword` in a SOPS secret, and remember there is then no `.cookie`.
4. **Read `--previous` logs for what works, too.** The `rpcauth` crash log also proved config, secret and volume permissions were fine, which narrowed the problem to one line.
5. **Longhorn's 25% minimum-free setting decides the max PVC size**, not the disk size. Do the math before picking a number, or the PVC sits in `Pending`.
6. **Don't use an image entrypoint that `chown -R`s a 1.3 TB datadir on every start.** Run the binary directly as the image's UID and let `fsGroup` + `OnRootMismatch` handle permissions once.
7. **Give bitcoind time to shut down** (`terminationGracePeriodSeconds: 300`). A SIGKILL mid-flush means days of `-reindex`.
8. **Talos formatting 2 TB takes ~2 minutes.** `NotFound` right after `apply-config` is normal; read `controller-runtime` logs before wiping anything.
9. **Moving a node breaks everything that pointed at it.** mempool, electrs and the Electrum wallet all depended on the VM. List the dependents before shutting the old host down.
