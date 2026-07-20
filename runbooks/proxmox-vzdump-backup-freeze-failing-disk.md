# Proxmox host freeze during VM backup — NFS backup target, plus an unrelated failing Longhorn disk

> A separate, unrelated issue turned up during this same investigation: the Proxmox host was double-mounting the Nextcloud VM's passthrough disk. That's about the Nextcloud disk, not the backup freeze, so it's documented in [Nextcloud data disk not automounting after Proxmox host reboot](./nextcloud-data-disk-not-automounting-boot.md) instead.

## What happened

Tried to get `vzdump` backups working on the Proxmox host. Every attempt made the host completely freeze — no disk activity light, no response to anything, nothing obviously wrong in the usual places. Only a hard reboot recovered it.

Two things got fixed along the way that turned out to be real but not the actual trigger: a worn Longhorn disk behind a bad USB-SATA enclosure (with a genuine bad sector, found via extended SMART self-test), and memory/THP tuning that helped the backup get a little further before still freezing. Neither one made the freeze go away.

**Confirmed: the NFS backup target was the actual trigger.** The backup was writing to NFS storage (`backup-proxmox`, an NFS export at `192.168.1.224`). On 2026-07-18, after retrying with a direct SATA connection and still freezing at 5%, switched the backup target to a 64GB USB pendrive plugged directly into the Proxmox host (local storage, no network filesystem involved). A full `vzdump 102 103 104` job ran against the pendrive with **zero host freeze** — VM 102 and 103 each ran for several minutes and multiple GB before failing, but failed with a clean, ordinary error (`File too large`, a FAT32 filesystem limit on the pendrive — see Diagnosis #4), not a hang. That's the confirmation: remove NFS from the path, and the host doesn't freeze anymore, even under sustained backup I/O for minutes at a time.

The disk/memory work (Diagnosis #1 and #2 below) turned up real, separate problems worth fixing, but neither was the actual freeze trigger.

## Symptoms

- `vzdump` backup of VM 102 (nextcloud) or 103 (knots) to NFS storage (`backup-proxmox`) would start, then the whole Proxmox host would stop responding entirely — no disk activity, no SSH, nothing. Only a hard reboot recovered it.
- Removing the large data disks from the VMs and backing up only the OS disks made no difference — still froze.
- Excluding VM 102 (the one hosting the NFS share used as the backup target) from the job didn't help either.
- `/srv/backup/nfs/proxmox-backup/dump` filled up with incomplete `.tmp`/`.vma.dat` files — no backup ever completed.
- After a host reboot, `journalctl -b -1 -p err` showed kernel hung-task warnings, timed right around when the VM 103 backup had started (`16:26:31` → hangs logged at `16:29:48`):
  ```
  kernel: INFO: task khugepaged:64 blocked for more than 122 seconds.
  kernel: INFO: task CPU 0/KVM:1499 blocked for more than 122 seconds.
  kernel: INFO: task worker:488783 blocked for more than 122 seconds.
  kernel: INFO: task worker:488783 is blocked on an rw-semaphore, but the owner is not found.
  ```
- 2026-07-18 retry (NFS target, direct SATA disk): froze again around 5%, same "everything just stops" symptom, disk stopped responding same as before.
- 2026-07-18, switched to a local USB pendrive as the backup target (no NFS): full `vzdump 102 103 104` job run, no freeze at any point. VM 102 got to 24% (~9.5GiB) in 5m25s, VM 103 got to 23% (~14.8GiB) in 8m27s — both far past every previous freeze point — before hitting an unrelated, clean error:
  ```
  zstd: error 70 : Write error : cannot write block : File too large
  ERROR: vma_queue_write: write error - Broken pipe
  ERROR: Backup of VM 102 failed - vma_queue_write: write error - Broken pipe
  ```
  Same error on VM 103. VM 104 (pihole, small disk) then started backing up normally when the log was captured.

## Diagnosis

### 1. First read: memory pressure / THP — ruled out

The hung-task log (`khugepaged` plus KVM vCPU threads blocked on an rw-semaphore with "owner not found") looked like a classic memory-compaction stall under pressure. Checked Transparent Huge Pages:

```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
# always [madvise] never
cat /sys/kernel/mm/transparent_hugepage/defrag
# always defer defer+madvise [madvise] never
```

Both already set to the commonly-recommended `madvise` — nothing to fix there. Checked memory headroom:

```
free -h
               total        used        free      shared  buff/cache   available
Mem:            23Gi        18Gi       4.6Gi        52Mi       440Mi       4.7Gi
Swap:          8.0Gi          0B       8.0Gi
```

18 of 23GB already committed to running VMs and almost no `buff/cache` — not much headroom for backup I/O buffering, but not swapping either.

Applied two mitigations anyway:
- `sysctl vm.dirty_background_ratio=5` / `vm.dirty_ratio=10` — force writeback earlier instead of letting dirty pages pile up
- `bwlimit: 30720` in `/etc/vzdump.conf` — throttle backup I/O

Result: the backup got further before freezing (previously it wouldn't even start; this time it reached ~9%) but still froze. Memory stayed around a normal 80% usage, but **I/O delay spiked to 92%** — pointed away from memory and squarely at a storage bottleneck.

### 2. A worn disk behind a bad USB-SATA bridge

`lsblk` + `smartctl -a /dev/sde` identified the disk: a Seagate/Samsung `ST500LM012` 500GB 5400rpm laptop drive, connected through a SATA-to-USB 3.0 enclosure — one of the ubiquitous cheap-chipset ones.

Key `smartctl` output while still in the USB enclosure:
```
SMART Status not supported: Incomplete response, ATA output registers missing
SMART overall-health self-assessment test result: PASSED   (attribute-based only)

Load_Cycle_Count        227220
G-Sense_Error_Rate      1270
Power_On_Hours          13054
Reallocated_Sector_Ct   0
Current_Pending_Sector  0
```

No reallocated/pending sectors, so not a clear-cut "dying disk" by SMART's numbers — but `Load_Cycle_Count` (227k head-parking cycles) and `G-Sense_Error_Rate` are high for its power-on hours, and the drive gave a faint clicking/vibration to the touch. Could be the drive, could be the enclosure — cheap SATA-USB bridge chips are a known source of exactly this kind of instability.

The line that mattered most was `SMART Status not supported: Incomplete response, ATA output registers missing`. That specific message shows up when the ATA passthrough command doesn't survive the round trip through the USB bridge chip cleanly — a known limitation/bug class of USB-SATA bridges combined with Linux's UAS driver, documented for causing command timeouts and hung tasks under sustained I/O, matching the symptom here almost exactly:

- [Debian Bug #1010745 — kernel task hung copying via USB SATA adapter](https://groups.google.com/g/linux.debian.kernel/c/8eSRom-p-ps)
- [Proxmox forum — USB storage causes high IO delay](https://forum.proxmox.com/threads/usb-storage-causes-high-io-delay.173346/)

Pulled the drive out of the enclosure and connected it directly to a free SATA port on the motherboard. Device renamed `/dev/sde` → `/dev/sdc`. Re-ran `smartctl -a /dev/sdc`:

```
SMART overall-health self-assessment test result: PASSED
```

No more "Incomplete response" warning — clean read this time, same drive (serial `S2ZAJ5BD908373`, attribute values consistent give or take normal increments), just a proper ATA command path now. Confirmed the USB enclosure/bridge was a real contributor to the I/O stalls.

That wasn't the whole story, though. Ran the extended self-test to check the rest of the surface:
```bash
smartctl -t long /dev/sdc
# Test will complete after Fri Jul 17 23:40:19 2026 -03
```
The test runs on the drive's own firmware, independent of the terminal/SSH session — no need to keep anything open, just poll it later:
```bash
smartctl -l selftest /dev/sdc
```
```
Num  Test_Description    Status                  Remaining  LifeTime(hours)  LBA_of_first_error
# 1  Extended offline    Completed: read failure       90%     13056         76490528
```
The test aborted after only ~10% of the surface, at LBA `76490528` — a genuine unreadable sector. This lines up with the `smartd` log entry seen right at the start of this investigation (`1 Currently unreadable (pending) sectors`) — the standard attribute table (`Current_Pending_Sector`, `Reallocated_Sector_Ct`) only reflects sectors that have actually been touched by I/O, so it read `0` until something (in this case, the full-surface self-test) actually tried to read that spot.

So both things were true at once: the USB enclosure/bridge was causing real instability (confirmed — the "Incomplete response" warning is gone since moving to SATA), **and** the drive itself has at least one genuine bad sector, unrelated to the interface. Moving to SATA fixed one contributing problem, not the whole picture — and the 2026-07-18 retry freezing again at 5% confirms it wasn't the whole picture.

This disk is passed through exclusively to the Kubernetes worker VM (108) for Longhorn:
```
# /etc/pve/nodes/108.conf
scsi2: /dev/disk/by-id/ata-ST500LM012_HN-M500MBB_S2ZAJ5BD908373,size=488386584K
```
Longhorn tracks disks by an internal UUID marker it writes onto the filesystem itself, not by device name — so it kept recognizing this disk across the `/dev/sde` → `/dev/sdc` rename without any reconfiguration needed. It's Longhorn-managed replicated storage (this disk holds a replica, with a second copy backed up elsewhere), so the blast radius of it failing outright is limited — but still worth fixing properly rather than leaving a flaky link in the chain.

### 3. The actual trigger: the NFS backup target

After the disk move to direct SATA still froze at 5% on 2026-07-18, the disk/memory explanations stopped adding up — a clean SATA connection with no USB bridge involved shouldn't behave that way. The one variable not yet tested: the backup target itself, NFS storage `backup-proxmox` (export at `192.168.1.224`, mounted on the host at `/mnt/pve/backup-proxmox`).

NFS hangs are a well-known cause of exactly this symptom class: when an NFS server has any latency, connection blip, or contention, processes doing I/O against a hard-mounted NFS share (Proxmox's default) go into uninterruptible sleep (`D` state) — which is precisely what the earlier `journalctl` hung-task log showed (`task worker:488783 blocked for more than 122 seconds`, `blocked on an rw-semaphore, but the owner is not found`). That log had originally looked like a memory-compaction stall, but it fits an NFS client hang just as well, if not better.

Swapped the backup target to a 64GB USB pendrive plugged directly into the Proxmox host — local storage, no network filesystem, no NFS server dependency at all:

```bash
# vzdump job pointed at the pendrive's local storage instead of backup-proxmox (NFS)
```

Result: the backup sailed past 5% (the point it had just frozen at), past the ~9% it previously reached with THP/dirty-ratio tuning, and was still running cleanly at 21% with no hang. That's the strongest signal yet — removing NFS from the path removed the freeze, at least up to this point.

This also explains a symptom that never made sense on the pure-disk theory: excluding VM 102 (the one hosting the Nextcloud disk, unrelated to Longhorn) from the backup job never helped, because the actual dependency wasn't which VM's disk was involved — it was always going out over NFS to `192.168.1.224` regardless of which VM was being backed up.

### 4. New (unrelated) error on the pendrive: FAT32's 4GB file-size limit

With NFS out of the picture, a full `vzdump 102 103 104` run against the pendrive no longer froze the host — but VM 102 and VM 103 both failed partway through with:

```
zstd: error 70 : Write error : cannot write block : File too large
ERROR: vma_queue_write: write error - Broken pipe
```

This is not a hang and not memory-related — `bwlimit` only throttles throughput, it doesn't cap file size. `File too large` is the OS returning `EFBIG` on `write()`, which happens when a filesystem's own maximum file size is exceeded. Both failures happened after minutes of steady ~28-30 MiB/s compressed writes — comfortably past 4GiB of compressed output by the time each one failed, which lines up exactly with **FAT32's hard 4GiB single-file limit**. Cheap pendrives usually ship pre-formatted FAT32, and the compressed `.vma.zst` archive is a single growing file, so it hits that ceiling every time regardless of which VM is being backed up (matches VM 102 and VM 103 both failing the same way).

Confirmed via `lsblk -f` on the host:
```
sdf
└─sdf1  vfat  FAT32  B3CB-5239  54.8G  4%  /mnt/pendrive
```

## Fix

**Backup target (the actual freeze trigger) — confirmed fixed:**
- Switched `vzdump`'s destination from NFS storage (`backup-proxmox` at `192.168.1.224`) to a 64GB USB pendrive plugged directly into the Proxmox host.
- Ran a full `vzdump 102 103 104` job against the pendrive — no host freeze at any point, even after several minutes of sustained I/O per VM. Confirms NFS was the actual trigger.

**Pendrive is FAT32, hitting the 4GB file-size limit:**
- `vzdump 102` and `vzdump 103` both failed partway through with `zstd: error 70: cannot write block: File too large` — the pendrive (`/dev/sdf1`) is FAT32, confirmed via `lsblk -f`, which can't hold a single file over 4GiB and the compressed `.vma.zst` archive is one growing file.
- Fix: reformat the pendrive as ext4.
  ```bash
  umount /mnt/pendrive
  mkfs.ext4 -L pendriveteste /dev/sdf1
  mount /dev/sdf1 /mnt/pendrive
  ```
- Still a temporary target either way — need a real long-term backup destination once a full backup completes cleanly.

**Longhorn disk (`/dev/sde` → `/dev/sdc`) — real problem, but not the freeze trigger:**
- Moved from the SATA-to-USB 3.0 enclosure to a direct SATA connection on the motherboard.
- Confirmed clean SMART output (no more "Incomplete response" warning) after the move — the bridge-related instability is resolved.
- Ran the extended self-test (`smartctl -t long`) — found a genuine read failure at LBA `76490528`, ~10% into the surface scan. The drive has a real bad sector independent of the USB/SATA question. Treating this disk as failing going forward regardless of the NFS finding.
- Plan is to replace this disk once new HDD prices come back down — currently high.

## Status / next steps

- [x] Run `smartctl -t long /dev/sdc` to fully validate the relocated disk — found a real read failure at LBA `76490528`, drive is not fully healthy
- [x] Re-run `vzdump` against VM 102/103 with the disk fix + NFS target — retried 2026-07-18, froze again at ~5%, same symptom. Disk fix alone did not resolve the freeze.
- [x] Test with the NFS target removed from the equation — swapped to a local USB pendrive on 2026-07-18, ran a full `vzdump 102 103 104` job with zero host freeze. **Confirmed: NFS was the actual freeze trigger, not the disk or memory.**
- [x] Diagnose the new pendrive error — `File too large` traced to the pendrive being FAT32 (4GiB single-file limit), unrelated to the original freeze
- [x] Reformat the pendrive as ext4 — done, backup job re-running against it as of 2026-07-18
- [ ] Confirm the ext4 pendrive run completes end-to-end with no error
- [ ] Figure out why the NFS mount hangs the host instead of erroring — check the NFS server (`192.168.1.224`) for its own health/load during past backup windows, and consider NFS mount options (`soft` vs `hard`, timeouts) so a future NFS issue degrades to an error instead of a full host freeze
- [ ] Decide on a real long-term backup destination — a 64GB pendrive is only good enough to prove the diagnosis, not for ongoing backups
- [ ] Plan to retire/replace the Longhorn disk (`ST500LM012`, serial `S2ZAJ5BD908373`) — not urgent for data safety (Longhorn replica + separate backup cover it), but it shouldn't be trusted long-term; waiting on HDD prices to come down
