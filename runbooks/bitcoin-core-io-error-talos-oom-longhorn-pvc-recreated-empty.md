# Bitcoin Core — `Input/output error` during IBD — Talos OOM controller killing the Longhorn instance-manager, then the PVC recreated empty

> Follow-up to [Bitcoin Core — init](./bitcoin-core-kubernetes-init-knots-vm-migration.md), which deployed `apps/bitcoin-core` on `worker-prox` with a 1-replica, strict-local Longhorn volume and started the IBD. Same class of failure as [Longhorn disk replacement on worker-prox](./longhorn-disk-replacement-worker-prox-and-rasp-usb-ssd-reset.md): a single-replica volume goes `faulted` when its only replica dies, and `auto-salvage` brings it back.

## What happened

During the IBD of Bitcoin Core v29.5, bitcoind stopped with `Failed to read block` and `Input/output error`. The SSD was fine. **Memory pressure on `worker-prox` made the Talos v1.12 userspace OOM controller kill the Longhorn instance-manager pod about every 28 minutes.** That pod runs the engine, the replica and the iSCSI target of the volume. With only one replica there was nowhere to fail over, so the volume dropped, the ext4 inside the PVC shut down, and bitcoind got `EIO`.

Longhorn auto-salvaged the volume and the pod came back by itself, ~31k blocks behind (unflushed `dbcache` lost). While recovering (VM RAM bump, Flux suspended, `worker-prox` reboot), the volume was `faulted` and the pod couldn't attach. At some point **the PVC `bitcoin-core-data` was deleted** (exact step not recorded). Flux recreated it and Longhorn provisioned a **new, empty volume**, which went `faulted` too because the disk had no room for a second 1300Gi replica. The chain survived on the old volume because of `reclaimPolicy: Retain`. The PVC was re-bound to the old volume by removing the PV's `claimRef` and pinning `volumeName` in Git.

**Root cause:** Talos OOM controller (PSI-triggered) picking the Longhorn instance-manager as victim, because it has no memory limit and its cgroup's `memory_current` includes the page cache of the replica writes. Disk saturation during IBD as a contributor is a **hypothesis, not measured**.

**Status: recovered.** bitcoind running on the old volume, IBD at ~block 297,000, synced from the existing chain (not from scratch). VM RAM raised to 16 GB and `dbcache` lowered from 3000 to 1500. Still watching for new OOM controller triggers (see [Follow-ups](#follow-ups)).

## Environment

| Item | Value |
|---|---|
| App | `apps/bitcoin-core` — namespace `bitcoin-core`, Deployment `bitcoin-core`, PVC `bitcoin-core-data` |
| Node | `worker-prox` — VM 108 on Proxmox, `192.168.1.152`, Talos v1.12.6 |
| Volume | Longhorn `pvc-864ed79b-987f-4ce2-afa8-911a12e480f5`, 1300Gi, **1 replica**, StorageClass `longhorn-bitcoin` (strict-local, `diskSelector: bitcoin`, `reclaimPolicy: Retain`) |
| Disk | 2 TB SSD, Talos `UserVolumeConfig` `u-bitcoin` → `/var/mnt/bitcoin` (xfs), Longhorn disk `bitcoin` |
| Memory before | VM 12 GB; bitcoind `dbcache=3000`, 4Gi request / 5Gi limit |
| Longhorn | `engine-replica-timeout` = 8s (default), `auto-salvage` = true |

I/O path, top to bottom:

```
bitcoind → ext4 in the PVC → Longhorn engine / iSCSI → 1 replica → Talos xfs /var/mnt/bitcoin → scsi3 of VM 108 → physical SSD (Proxmox)
```

## Symptoms

- bitcoind log (`kubectl -n bitcoin-core logs deploy/bitcoin-core`), pod `bitcoin-core-57dbc65645-vhw2r`:
  ```
  2026-11-10T17:53:36Z UpdateTip: new best=...261f9 height=288885 ... progress=0.024235 cache=1186.7MiB(
  2026-11-10T17:54:14Z [error] ReadBlock: Deserialize or I/O error - AutoFile::read: fread failed: iostream error at FlatFilePos(nFile=120, nPos=57626378)
  2026-11-10T17:54:14Z [error] A fatal internal error occurred, see debug.log for details: Failed to read block.
  2026-11-10T17:54:14Z [error] ProcessNewBlock: ActivateBestChain failed (Failed to read block.)
  2026-11-10T17:54:14Z Shutdown: In progress...
  terminate called after throwing an instance of 'std::filesystem::__cxx11::filesystem_error'
    what():  filesystem error: cannot remove: Input/output error [/home/bitcoin/.bitcoin/peers.7551]
  ```
  Both reading `blk00120.dat` **and** removing a small file failed. When even `remove` gets `EIO`, the whole filesystem is gone. Not a bitcoind bug.
- After the recovery attempt: pod stuck on `AttachVolume failed`; Longhorn showing two volumes for the same app, one `faulted` and empty.

## Timeline

> UTC, 2026-11-10.

| Time | Event |
|---|---|
| 16:59:24 | 1st Talos OOM controller trigger (BestEffort pod `e7821830` + instance-manager) |
| 17:27:35–17:27:56 | 2nd trigger. `I/O error` on `sdc`, ext4 journal aborted, auto-salvage and remount as `sde` |
| 17:54:52–17:55:35 | 3rd trigger. Engine "dead unexpectedly", volume `faulted`, auto-salvage, remount as `sdc`. bitcoind dies at `height=288885` |
| ~17:57 | New pod starts by itself. At 18:05 it was at `height=257047`: **~31k blocks lost** (≈1.2 GB of unflushed `dbcache`; no corruption in the log) |
| later | VM RAM 12 → 16 GB, `dbcache` 3000 → 1500, Flux suspended, pod scaled to 0, `worker-prox` rebooted |
| later | Volume `faulted`, pod can't attach. PVC deleted/recreated → new empty volume `pvc-8378cf92-...` (`faulted`, no space). Old `pvc-864ed79b-...` left `Released` |
| later | Empty volume removed, `claimRef` dropped from the old PV, `volumeName` pinned in Git, Flux resumed |
| end | bitcoind running on the old chain, IBD at ~297,000 |

## Diagnosis

### 1. Longhorn after the fact — already healed, not useful alone

```bash
kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness,NODE:.status.currentNodeID
kubectl -n longhorn-system get replicas.longhorn.io -o custom-columns=NAME:.metadata.name,VOLUME:.spec.volumeName,NODE:.spec.nodeID,STATE:.status.currentState,FAILEDAT:.spec.failedAt
```

Everything was `attached`/`healthy` and the pod `Running` with 0 restarts — but it was a **new pod**. Longhorn had already auto-salvaged and remounted.

### 2. Kernel on worker-prox — physical SSD ruled out

```bash
talosctl -n 192.168.1.152 dmesg | grep -iE 'i/o error|blk_update|xfs|ext4|sdd|reset|abort|critical medium' | tail -50
```
```
17:27:47 Buffer I/O error on device sdc, logical block 7460937
17:27:47 Aborting journal on device sdc-8.
17:27:47 EXT4-fs (sdc): shut down requested (2)
17:27:48 sd 6:0:0:1: Power-on or device reset occurred
17:27:56 EXT4-fs (sde): mounted filesystem 6bd91a4d-00a6-4415-afab-08b7ab0f48c3 r/w
17:55:31 I/O error, dev sde, sector 1363410944 op 0x1:(WRITE)
17:55:31 Aborting journal on device sde-8.
17:55:32 EXT4-fs (sde): shut down requested (2)
17:55:33 sd 4:0:0:1: Power-on or device reset occurred
17:55:35 EXT4-fs (sdc): mounted filesystem 6bd91a4d-00a6-4415-afab-08b7ab0f48c3 r/w
```

- `sdc`/`sde` (ext4, same UUID `6bd91a4d...`, LUN `x:0:0:1`) are **the Longhorn iSCSI device handed to the pod**, not a physical disk. The name changes on every remount.
- The physical SSD (`sdd`, xfs on `/var/mnt/bitcoin`) had **no errors** — grepping for `sdd` and `xfs` returned nothing. **SSD is a red herring.**
- The volume dropped **twice** (17:27 and 17:55).

### 3. Longhorn — engine/replica process killed, not a timeout

```bash
kubectl -n longhorn-system get pods -o wide | grep -E 'instance-manager|longhorn-manager'
kubectl -n longhorn-system logs instance-manager-<worker-prox> --since=2h | grep 864ed79b | grep -iE 'error|timeout|fail'
# --tail=-1 is required: with -l, kubectl logs shows only 10 lines per pod by default and the grep comes back empty
kubectl -n longhorn-system logs -l app=longhorn-manager -c longhorn-manager --tail=-1 --since=2h | grep 864ed79b
kubectl -n longhorn-system get events --sort-by=.lastTimestamp | grep -iE '864ed79b|bitcoin'
```

- `instance-manager-e33dd...` (worker-prox): **AGE 12m**. `longhorn-manager-lcs64` (worker-prox): **134 restarts**, last one 12m before.
- Events:
  ```
  Warning DetachedUnexpectedly  Engine of volume pvc-864ed79b... dead unexpectedly, setting v.Status.Robustness to faulted
  Warning AutoSalvaged          Replica pvc-864ed79b...-r-67862805 ... will be automatically salvaged
  Normal  Remount               ... requested remount at 2026-11-10T17:54:09Z after automatically salvaging replicas
  Warning Ready (node)          Waiting for disk bitcoin (/var/mnt/bitcoin) on node worker-prox to be ready
  ```
- longhorn-manager: `All replicas are failed, auto-salvaging volume` → `Bringing up 0 replicas` (disk not ready yet) → `Bringing up 1 replicas`.
- One attempt to start the replica failed with `listen unix .../pvc-864ed79b....sock: bind: address already in use` — orphan socket from the killed instance-manager.
- No replica timeout logged (`engine-replica-timeout` = 8s). **The process was killed.**

### 4. Talos OOM controller — the cause

```bash
talosctl -n 192.168.1.152 dmesg | grep -iE 'oom|killed process|blocked for more|hung_task' | tail -20
```
```
16:59:24 [talos] OOM controller triggered
16:59:24 [talos] Sending SIGKILL to cgroup .../kubepods/besteffort/pode7821830-...
16:59:24 [talos] Sending SIGKILL to cgroup .../kubepods/burstable/poddd3d540d-...   (22 processes)
17:27:35 [talos] OOM controller triggered → besteffort/pode7821830-...
17:27:36 [talos] OOM controller triggered → burstable/podb401438f-...                 (22 processes)
17:54:52 [talos] OOM controller triggered → besteffort/pode7821830-...
17:54:53 [talos] OOM controller triggered → burstable/pod5c560978-...                 (22 processes)
17:54:53 [talos] OOM controller triggered → besteffort/pod896dfb87-...
```

- Triggers every **~28 min**, each right before a volume drop.
- The **Burstable pod with ~22 processes and a different UID every time** is the **worker-prox instance-manager** (recreated after each kill).
- The **BestEffort pod `e7821830`** (always the same) is probably `longhorn-manager-lcs64` (134 restarts). **Not confirmed** by UID.
- Talos v1.12 has its own **userspace OOM killer**. It shows up in `dmesg` as `[talos] OOM controller triggered`, **not** as the kernel's `Killed process` or as `OOMKilled` on the pod.
- `kubectl top` doesn't work here: `Metrics API not available` (no metrics-server).

Why Longhorn is the victim and bitcoind isn't (Talos v1.12 docs, `configure-your-talos-cluster/system-configuration/oom.mdx`):

- Default trigger: `memory_full_avg10 > 12.0 && d_memory_full_avg10 > 0.0` — memory **pressure** (PSI), not RAM running out.
- Default ranking: `memory_max.hasValue() ? 0.0 : {Besteffort: 1.0, Burstable: 0.5, ...}[class] * memory_current`.
  - bitcoind has a memory limit (5Gi) → score 0 → never picked.
  - The instance-manager has **no limit**, and its cgroup's `memory_current` includes the **page cache** of what the replica writes to the SSD. During IBD that gets large, so it becomes the target.

Disk contribution: in Proxmox, VM 108 disk I/O was around **~600 M** (seen by me in the UI) — the ceiling of a SATA SSD. **Hypothesis, not measured:** saturated disk → dirty pages pile up → processes stall on memory → PSI rises → Talos OOM controller fires.

### 5. After the reboot — two volumes, the new one empty

Longhorn UI:

| Volume | State | Used | PV | Note |
|---|---|---|---|---|
| `pvc-8378cf92-a231-42ed-b56e-8936755a7ea4` | `faulted` | 0 Bi | `Bound` | **New and empty**, created when Flux recreated the PVC |
| `pvc-864ed79b-987f-4ce2-afa8-911a12e480f5` | `detached` | 62.5 Gi | `Released` | **The volume with the chain** |

- The new volume was `faulted` because **it didn't fit**: the old one already takes the 1300Gi of disk `bitcoin` (limit ≈ 1329 Gi).
- Deleting only the `faulted` volume doesn't help: with Flux active, it recreates the PVC and Longhorn provisions another empty volume.
- A `faulted` 1-replica volume does **not** mean data loss — the replica just has `failedAt` set. Salvage (automatic, or from the UI with the volume `detached`) unlocks it and uses the replica's data. It doesn't delete anything, doesn't fsck, and doesn't bring back what was only in RAM.

## Fix

### 1. Re-bind the PVC to the old volume (applied)

1. Stop Flux and the pod:
   ```bash
   flux suspend kustomization apps
   kubectl -n bitcoin-core scale deploy/bitcoin-core --replicas=0
   ```
2. Check which PVC is on the empty volume, and that the old PV is `Retain`:
   ```bash
   kubectl -n bitcoin-core get pvc -o wide
   kubectl get pv pvc-864ed79b-987f-4ce2-afa8-911a12e480f5 -o jsonpath='{.spec.persistentVolumeReclaimPolicy}{"\n"}'
   ```
3. Delete **only** the new, empty side:
   ```bash
   kubectl -n bitcoin-core delete pvc bitcoin-core-data
   kubectl delete pv pvc-8378cf92-a231-42ed-b56e-8936755a7ea4
   kubectl -n longhorn-system delete volumes.longhorn.io pvc-8378cf92-a231-42ed-b56e-8936755a7ea4
   ```
4. Release the old PV from the deleted PVC (`Released` → `Available`):
   ```bash
   # A Released PV stays reserved for the old PVC by uid in spec.claimRef.
   # A new PVC with the same name has a different uid and can't bind. This only drops the reference; data is untouched.
   kubectl patch pv pvc-864ed79b-987f-4ce2-afa8-911a12e480f5 --type json -p '[{"op":"remove","path":"/spec/claimRef"}]'
   ```
   Right after the patch, `kubectl edit pv` still showed `status.phase: Released`. That's just lagging status — the controller moves it to `Available` by itself. `status` can't be edited with `kubectl edit`.
5. Pin the volume in Git — `apps/bitcoin-core/overlays/homelab/patch-pvc.yaml`, commit and push:
   ```yaml
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: bitcoin-core-data
     namespace: bitcoin-core
   spec:
     storageClassName: longhorn-bitcoin
     # Binds the PVC to the Longhorn volume that holds the chain (incident 2026-11-10).
     # Without this, if the PVC is deleted, Flux recreates it and Longhorn provisions a new empty volume.
     volumeName: pvc-864ed79b-987f-4ce2-afa8-911a12e480f5
   ```
   **Order matters:** step 3 must happen before the push. `spec.volumeName` is immutable on an existing PVC; if the new PVC still exists, Flux fails to apply.
6. Resume:
   ```bash
   flux resume kustomization apps
   kubectl -n bitcoin-core get pvc -o wide     # Bound to pvc-864ed79b...
   kubectl -n bitcoin-core get pod -w
   ```
   Confirmed — the recreated PVC bound to the old volume:
   ```
   bitcoin-core   bitcoin-core-data   Bound   pvc-864ed79b-987f-4ce2-afa8-911a12e480f5   1300Gi   RWO   longhorn-bitcoin   8m44s
   ```

**Never delete the bitcoin-core PVC to "fix" a `faulted` volume.** Detach and salvage instead.

### 2. Reduce memory pressure (applied)

| Change | Why |
|---|---|
| VM 108 RAM: **12 GB → 16 GB** | Less memory pressure → fewer OOM controller triggers |
| `dbcache` **3000 → 1500** in `configmap.yaml` | Frees RAM and shrinks each flush burst to disk |
| `worker-prox` rebooted | Apply the new RAM and clear Longhorn state |
| **No** Talos `OOMConfig` | Explicit decision |

Notes:
- New VM memory only takes effect with a VM power off/on (`talosctl shutdown` + `qm start 108`), not `talosctl reboot`, unless memory hotplug is enabled.
- The pod memory limit must stay above `dbcache + maxmempool (300 MB) + ~500 MB`, or the kernel `OOMKilled`s bitcoind. Reference: `dbcache=2000` → 3Gi/4Gi; `dbcache=1000` → 2Gi/3Gi.
- A changed ConfigMap doesn't restart the pod. Since the pod was scaled to 0, it came up with the new value.

### Verification

```bash
# VM memory (~16 GB)
talosctl -n 192.168.1.152 memory

# PVC bound to the right volume
kubectl -n bitcoin-core get pvc -o wide           # VOLUME = pvc-864ed79b-...
kubectl -n longhorn-system get volumes.longhorn.io pvc-864ed79b-987f-4ce2-afa8-911a12e480f5 \
  -o custom-columns=STATE:.status.state,ROBUSTNESS:.status.robustness,NODE:.status.currentNodeID

# bitcoind syncing from the old chain
kubectl -n bitcoin-core exec deploy/bitcoin-core -- bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getblockchaininfo \
  | grep -E '"blocks"|"headers"|verificationprogress|initialblockdownload'
kubectl -n bitcoin-core logs deploy/bitcoin-core --tail=200 | grep -iE 'error|corrupt'

# Talos OOM controller must not fire again
talosctl -n 192.168.1.152 dmesg | grep -i 'OOM controller'
```

## Open question — is disk saturation what drives the memory pressure?

Each unclean stop costs thousands of IBD blocks and aborts the ext4 journal; repeated drops raise the risk of corruption and a `-reindex-chainstate`. If the OOM controller fires again even with 16 GB, check, most likely first:

1. **Dirty page buildup from a saturated SSD.** Watch disk I/O on VM 108 in Proxmox during IBD. Mitigation without `OOMConfig`: smaller `vm.dirty_background_bytes` / `vm.dirty_bytes` in Talos `machine.sysctls`.
2. **The SSD itself collapsing under sustained writes** (QLC / DRAM-less). On Proxmox:
   ```bash
   smartctl -i /dev/<2tb-ssd>
   qm config 108        # check iothread, aio, cache on the bitcoin disk
   ```
3. **longhorn-manager itself leaking/growing** (134 restarts). Identify the BestEffort pod:
   ```bash
   kubectl get pods -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,UID:.metadata.uid | grep e7821830
   ```

## Follow-ups

- [ ] Watch `dmesg` for `OOM controller` for the rest of the IBD. If it comes back at 16 GB, try lower `vm.dirty_*` sysctls on worker-prox.
- [ ] Confirm which pod is BestEffort `e7821830` and look into the 134 restarts of `longhorn-manager-lcs64`.
- [ ] Check the 2 TB SSD model (`smartctl -i`) and the VM 108 disk config (`qm config 108`).
- [ ] Document the pinned `volumeName` and the "do not delete the PVC" warning in the `apps/bitcoin-core` README.
- [ ] After IBD: `dbcache=1000` and memory 2Gi/3Gi (or 2Gi/4Gi), as already planned in the [init runbook](./bitcoin-core-kubernetes-init-knots-vm-migration.md#follow-ups).
- [ ] Optional: install metrics-server for `kubectl top`.
- [ ] Alerting: Longhorn volumes `faulted`/`degraded` and `OOM controller` in the Talos log (Alloy → Loki).
