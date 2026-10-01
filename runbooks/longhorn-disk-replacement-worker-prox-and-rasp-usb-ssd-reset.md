# Longhorn disk replacement on worker-prox — and the worker-rasp USB SSD dropping out mid-swap

> Follow-up to [Proxmox host freeze during VM backup](./proxmox-vzdump-backup-freeze-failing-disk.md), which found the bad sector on this same Samsung `ST500LM012` (serial `S2ZAJ5BD908373`) and left "replace it" as a to-do. This runbook is that replacement, plus a second failure that hit during it.

## What happened

The Samsung HDD passed through to the Talos worker VM (`worker-prox`, VM 108) as the Longhorn disk was failing. Scheduling was disabled on it in Longhorn, and its replicas were marked `failed` (~22:00–22:05 UTC). The plan was to swap it for a Seagate `ST500VT003` (serial `ZN909T0C`) and let Longhorn rebuild on the new disk.

Eviction didn't move anything. There are only 2 nodes with Longhorn disks (`worker-prox` and `worker-rasp`), and with the default hard anti-affinity there was nowhere to put a second copy. So the swap went ahead with every volume depending on its single replica on `worker-rasp`.

During the swap (~22:39 UTC), the **USB SSD on the Raspberry Pi (`worker-rasp`) reset and reconnected with a different device name** (`sda` → `sdh`). The Talos mount kept pointing at the old device, which was now dead, and Longhorn got `input/output error` on the only healthy copy of every volume. Result: **5 volumes `faulted`, 2 `degraded`**.

Rebooting `worker-rasp` brought the SSD back on `/dev/sda` and the mount came back. `auto-salvage` recovered all the volumes to `degraded` by itself. Then the old disk entry was replaced with the new one in Longhorn, and replicas started rebuilding on the new disk.

**Status: recovered, rebuilding.** Volumes were `degraded` and rebuilding onto the new disk at the time of writing. Confirming everything reaches `healthy` and the apps are intact is still pending (see [Follow-ups](#follow-ups)).

## Environment

**Proxmox host (`server`)**

| Device | Model | Use |
|---|---|---|
| nvme0n1 | SM2P32A8-256GC | Proxmox system + `local-lvm` (VM disks) |
| sda | KINGSTON SA400S37960G | ext4 (other use) |
| sdb + sdd | CT1000BX500SSD1 + KINGSTON SA400S37960G | LVM `vg_knots-lv_knots` |
| **sdc (old)** | **ST500LM012 HN-M500MBB** (Samsung Spinpoint 500 GB), serial `S2ZAJ5BD908373` | Passthrough to VM 108 → Longhorn disk. **Failing** |
| **sdc (new)** | **ST500VT003-1RE17D** (Seagate 500 GB), serial `ZN909T0C` | Replacement |
| sde | WDC WD10EURX | ext4 (other use) |
| sdf | SanDisk (pendrive) | `/mnt/pendrive` |

**VM 108 (`worker`), Talos node `worker-prox`**: `192.168.1.152`, Talos v1.12.6, Kubernetes v1.35.2
- `scsi0`: `local-lvm:vm-108-disk-1` (32 GB), Talos system disk (`/dev/sda` inside the VM)
- `scsi2`: physical HDD passthrough via `/dev/disk/by-id/ata-...`, `backup=0` (`/dev/sdb` inside the VM)
- Talos mounts it with a `UserVolumeConfig`, as `/dev/sdb1` (xfs) on `/var/mnt/longhorn`:
  ```yaml
  apiVersion: v1alpha1
  kind: UserVolumeConfig
  name: longhorn
  provisioning:
    diskSelector:
      match: "'/dev/disk/by-id/scsi-0QEMU_QEMU_HARDDISK_drive-scsi2' in disk.symlinks"
    minSize: 400GiB
    grow: true
  filesystem:
    type: xfs
  ```
  The selector matches the **VM's `scsi2` slot**, not the physical disk's serial. Any **empty** disk attached as `scsi2` gets formatted and mounted automatically.
- Longhorn disk: `hd-samsung`, path `/var/mnt/longhorn`, storageReserved 20 GiB

**Raspberry Pi, Talos node `worker-rasp`**: `192.168.1.91`, Talos v1.13.2
- System on SD card `mmcblk0` (64 GB)
- **KINGSTON SA400S37120G (120 GB) SSD over USB**, mounted by Talos as volume `e-ssd` on `/var/mnt/ssd`
- Longhorn disk: `ssd`, path `/var/mnt/ssd/longhorn`, storageReserved 1 GiB

**Other nodes:** `controlplane-proxmox` (no Longhorn disk)

**Longhorn settings**

| Setting | Value |
|---|---|
| auto-salvage | true |
| storage-minimal-available-percentage | 25 |
| storage-over-provisioning-percentage | 100 |
| replica-soft-anti-affinity | false (default) |

**Volumes affected**

| PV | Namespace | PVC |
|---|---|---|
| pvc-003a200b-c63e-4113-a1a0-df143258edac | mempool | mempool-mysql-longhorn |
| pvc-1625423a-e6f2-4f7f-bebc-286ed92e9910 | grafana-longhorn-db | pg-grafana-longhorn-1 |
| pvc-64b9ed3b-a465-4ef7-8bf8-c83678d69af4 | forgejo | forgejo-mysql-longhorn |
| pvc-6f2b3eca-9cc7-4804-8e3f-de492ba24fbd | loki | loki-rwx (RWX) |
| pvc-b74c3dde-8cdf-476c-9b3c-8c025c8b4d3d | grafana-longhorn-db | pg-grafana-longhorn-3 |
| pvc-3f982e45-fe6c-41b7-9018-e06c69d1c3d0 | (not identified) | — |
| pvc-e163a298-d75c-4c7f-adac-cafea3cbf3b9 | (not identified) | — |

## Timeline

> Longhorn `failedAt` fields are in **UTC**. `kubectl describe node` shows local time (**-03:00**).

| Time | Event |
|---|---|
| before 22:00 UTC | Samsung HDD on worker-prox failing. Scheduling disabled on the disk in Longhorn. |
| ~22:00–22:05 UTC | worker-prox replicas marked `failed` (failing disk + eviction started). |
| — | `Eviction Requested` on `hd-samsung`. **Replica count didn't drop**: no eligible disk to move to. |
| — | Decided to go ahead without eviction and let Longhorn rebuild on the new disk. The safety check (every volume has a `running` replica on another node) was suggested **but not done**. |
| — | `kubectl drain worker-prox`, `qm shutdown 108`, `qm set 108 --delete scsi2`, disk powered off and physically swapped. |
| **~22:39 UTC** | worker-rasp replicas marked `failed`. **Real cause, found later: the Pi's USB SSD reset and reconnected.** The old mount went dead and Longhorn got `input/output error`. |
| — | New disk wiped (`wipefs`/`sgdisk`) and attached as `scsi2` on VM 108. Talos formatted it as xfs and mounted it on `/var/mnt/longhorn` by itself. |
| — | Longhorn: **5 volumes `faulted`**, 2 `degraded`. |
| — | **Salvage** in the UI failed: `disk with UUID e854fcb0-... on node worker-rasp is unschedulable`. |
| — | Rasp `ssd` disk showed `NoDiskInfo`: `open /var/mnt/ssd/longhorn/longhorn-disk.cfg: input/output error`. `talosctl get disks` showed the SSD as `sdh`, but volume `e-ssd` still pointed at `/dev/sda1`. `talosctl mounts` hung. |
| 23:12 UTC (20:12 -03) | `talosctl reboot` on worker-rasp. Node went `NotReady`: it hung on shutdown trying to unmount the dead mount. |
| — | Forced reboot / power-cycle of the Pi. SSD came back as `/dev/sda`, `e-ssd` mounted on `/var/mnt/ssd` (32 GB used of 117 GB). |
| — | **auto-salvage** recovered the volumes by itself: all went `faulted` → `degraded`. |
| — | worker-prox `unschedulable` in Longhorn: `record diskUUID doesn't match the one on the disk` (`hd-samsung` still had the old disk's UUID, `7c39b7f6-...`). |
| — | UI: `hd-samsung` Scheduling disabled, disk removed, new disk `hd-barracuda` added on `/var/mnt/longhorn` (reserved 20 GiB, Scheduling enabled). Disk Ready/Schedulable, replicas started rebuilding on it. |

## Root cause

1. **Initial cause:** the Samsung `ST500LM012` passed through to VM 108 was failing (known bad sector, see the linked runbook).
2. **Why volumes went `faulted`:** during the swap, the **Pi's USB SSD reset and came back under a different device name** (`sda` → `sdh`). The Talos mount stayed on the old device, and Longhorn lost access to the **only healthy copy** of the volumes.
   - Likely cause of the USB reset: not enough power from the Pi's USB port for the SSD, and/or the SATA-USB adapter running in UAS mode. **Not confirmed** from `dmesg`.
3. **Contributing:** only 2 storage nodes, so each volume has at most 2 replicas. Taking one node's disk out leaves **everything** on a single disk — here, a USB SSD, the weakest link.
4. **Contributing:** Longhorn eviction can't work in this topology (no third disk/node to receive replicas).

## Fix — replacing the Longhorn disk on worker-prox

### 1. Identify the disk

On Proxmox:

```bash
lsblk -o NAME,SIZE,MODEL,SERIAL,FSTYPE,MOUNTPOINT
ls -l /dev/disk/by-id/ | grep sdc
grep -n "" /etc/pve/qemu-server/*.conf | grep -iE "scsi|virtio|sata"
```

On Talos:

```bash
talosctl -n 192.168.1.152 get disks
talosctl -n 192.168.1.152 mounts | grep /var/mnt
talosctl -n 192.168.1.152 get machineconfig -o yaml | grep -B3 -A15 -E "disks:|UserVolumeConfig"
```

### 2. Before removing the disk: check the replicas (critical)

```bash
kubectl -n longhorn-system get replicas.longhorn.io -o custom-columns=NAME:.metadata.name,VOL:.spec.volumeName,NODE:.spec.nodeID,STATE:.status.currentState,FAILEDAT:.spec.failedAt
kubectl -n longhorn-system get nodes.longhorn.io <other-node> -o jsonpath='{range .status.diskStatus.*}{range .conditions[*]}{.type}: {.status} {.message}{"\n"}{end}{end}'
```

Every volume needs a `running` replica **on another node**, and that node's disk must be **`Ready: True`**. **This wasn't checked in this incident, which is why the rasp SSD problem went unnoticed.**

### 3. Remove the old disk

```bash
kubectl drain worker-prox --ignore-daemonsets --delete-emptydir-data --force
# on Proxmox:
qm shutdown 108 && qm status 108
qm set 108 --delete scsi2
sync
hdparm -Y /dev/sdc
echo 1 > /sys/block/sdc/device/delete
```

The VM has to be shut down because the disk is mounted inside Talos, which has no shell to `umount` it by hand.

### 4. Install the new disk

```bash
lsblk -o NAME,SIZE,MODEL,SERIAL,FSTYPE,MOUNTPOINT /dev/sdc   # confirm model/serial!
wipefs -a /dev/sdc1
wipefs -a /dev/sdc
sgdisk --zap-all /dev/sdc
blockdev --rereadpt /dev/sdc      # partprobe isn't installed on Proxmox by default
qm set 108 --scsi2 /dev/disk/by-id/ata-ST500VT003-1RE17D_ZN909T0C,backup=0
qm start 108
```

The disk must be **empty**. Talos only provisions a `UserVolumeConfig` on a disk with no partitions or filesystem.

### 5. Check on Talos

```bash
talosctl -n 192.168.1.152 get disks
talosctl -n 192.168.1.152 mounts | grep /var/mnt    # /dev/sdb1 ... /var/mnt/longhorn
kubectl uncordon worker-prox
```

### 6. Longhorn: replace the disk entry

Symptom: `record diskUUID doesn't match the one on the disk`. The new disk has a different UUID, so Longhorn won't reuse the old entry.

UI → **Node** → `worker-prox` → **Edit node and disks**:

1. Delete the old worker-prox replicas (Volume → replica → trash icon).
2. Old disk: Scheduling **Disable** → Save.
3. Old disk: **trash icon** → Save.
4. **Add Disk**: name `hd-barracuda`, File System, path `/var/mnt/longhorn`, reserved 20 Gi, Scheduling Enable → Save.

Same thing with `kubectl`:

```bash
kubectl -n longhorn-system patch nodes.longhorn.io worker-prox --type merge -p '{"spec":{"disks":{"hd-samsung":{"allowScheduling":false}}}}'
kubectl -n longhorn-system patch nodes.longhorn.io worker-prox --type merge -p '{"spec":{"disks":{"hd-samsung":null}}}'
kubectl -n longhorn-system patch nodes.longhorn.io worker-prox --type merge -p '{"spec":{"disks":{"hd-barracuda":{"path":"/var/mnt/longhorn","allowScheduling":true,"evictionRequested":false,"storageReserved":21474836480,"diskType":"filesystem","tags":[]}}}}'
```

## Fix — USB SSD dropped out on worker-rasp

### Symptoms

- Volumes `faulted`, rasp replicas with `failedAt` set
- Salvage fails with `disk ... on node worker-rasp is unschedulable`
- Longhorn disk `ssd`: `NoDiskInfo`, `storageMaximum: 0`, message `longhorn-disk.cfg: input/output error`
- `talosctl get disks` shows the SSD under a new letter (e.g. `sdh`), while `get volumestatus` still shows `e-ssd` on `/dev/sda1`
- `talosctl mounts` hangs

### Diagnosis

```bash
kubectl -n longhorn-system get nodes.longhorn.io worker-rasp -o jsonpath='{range .status.diskStatus.ssd.conditions[*]}{.type}: {.message}{"\n"}{end}'
talosctl -n 192.168.1.91 get disks
talosctl -n 192.168.1.91 get volumestatus
talosctl -n 192.168.1.91 dmesg | grep -iE "usb|uas|sd[a-z]|xfs|i/o error|reset" | tail -40
```

### Recovery

1. **Don't** remove the disk in Longhorn, **don't** delete the rasp replicas, **don't** format anything. The data is still on the SSD.
2. Stop the apps whose volumes only have a replica on the rasp (avoids more writes to the dead mount).
3. Reboot the node:
   ```bash
   kubectl drain worker-rasp --ignore-daemonsets --delete-emptydir-data --force
   talosctl -n 192.168.1.91 reboot
   ```
   If it hangs on shutdown (node `NotReady`, "Kubelet stopped posting node status"): `talosctl -n 192.168.1.91 reboot --mode force`. Last resort: power-cycle the Pi.
4. Check:
   ```bash
   talosctl -n 192.168.1.91 mounts | grep /var/mnt     # /dev/sda1 ... /var/mnt/ssd
   kubectl uncordon worker-rasp
   ```
5. With `auto-salvage=true`, Longhorn recovered the volumes by itself (`faulted` → `degraded`). If it doesn't: stop the app (volume `detached`) → UI → Volume → **Salvage** → pick the replica with the **most recent** `failedAt`.

## Follow-ups

- [ ] Confirm **all** volumes reach `healthy`:
  ```bash
  kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUST:.status.robustness
  ```
- [ ] Check app integrity: mempool (mysql), forgejo (mysql), loki, grafana-longhorn-db (CloudNativePG: `kubectl -n grafana-longhorn-db get cluster,pods`)
- [ ] Set `replica-soft-anti-affinity` back to `false` if it was changed
- [ ] Keep the old Samsung until the checks above pass, then dispose of it
- [ ] **Raspberry:** find the cause of the USB reset (`talosctl -n 192.168.1.91 dmesg | grep -iE "usb|uas|reset"`):
  - official power supply (Pi 5: 5V/5A) or a powered USB hub
  - if it's UAS, add `usb-storage.quirks=<vid>:<pid>:u` to the Talos kernel args
- [ ] Consider a **3rd storage node or disk** in Longhorn, so eviction actually works and 2 copies stay up during maintenance
- [ ] Consider **Longhorn backups** (S3/NFS backup target) for the database volumes
- [ ] Align versions: `talosctl` 1.13.8, worker-prox 1.12.6, worker-rasp 1.13.2
- [ ] Monitoring/alerts for: Longhorn disk `Ready` condition, `degraded`/`faulted` volumes, kernel I/O errors

## Lesson

1. **Disabling Scheduling ≠ moving replicas.** It only stops new replicas. Emptying a disk needs `Eviction Requested`, and that only works if another eligible disk exists.
2. **With 2 storage nodes, eviction doesn't work.** Default anti-affinity leaves nowhere to move replicas. Either turn on `replica-soft-anti-affinity` temporarily (if the other node has space), or accept `degraded` during the swap.
3. **Before removing a disk, check the HEALTH of the disk that will hold the only copy** (its `Ready` condition in Longhorn), not just the replica states.
4. **A USB SSD on the Raspberry is a weak point.** A USB reset changes the device name and leaves a dead mount. Talos doesn't remount it by itself; only a reboot fixes it.
5. **A `failed` replica doesn't mean lost data.** Look at `failedAt`: the replica that failed last has the newest data and is the one to Salvage.
6. **The `diskSelector` by SCSI slot (`drive-scsi2`) made the swap easy.** The new disk in the same slot was provisioned automatically, with no Talos config change.
7. **After a physical disk swap, Longhorn won't reuse the old disk entry** (different UUID). Remove the old disk and add a new one with the same path.
8. **Keep the old disk** until every volume is `healthy` and the apps check out. Its `replicas/` folders allow manual recovery.
