# Nextcloud — data disk not automounting after Proxmox host reboot

> Follow-up to [Nextcloud data disk unmounted](./nextcloud-data-disk-unmounted.md), which left this as an open question. This runbook answers it: why `/dev/sdb1` doesn't remount itself at boot.

## What happened

After rebooting the whole Proxmox host, the Nextcloud VM came back up but `/dev/sdb1` was not mounted at `/mnt/nextcloud` — same symptom as the first occurrence. `lsblk -f` and `/etc/fstab` both looked correct (right UUID, right mount point, right options), which ruled out a config typo.

**Root cause:** the `ext4` filesystem on `sdb1` had its superblock error flag set (`mounting fs with errors, running e2fsck is recommended`) from a prior unclean shutdown. The fstab entry has `pass=2`, so systemd runs `systemd-fsck@...` on that device before mounting. The dirty flag made the automatic (non-interactive) fsck at boot fail, which cascaded into `mnt-nextcloud.mount` failing with "dependency" — it never even attempted the mount.

## Symptoms

- `/mnt/nextcloud` not mounted after boot, same as before
- `lsblk -f` and `/etc/fstab` both correct — not a config problem
- `journalctl -b -u mnt-nextcloud.mount`:
  ```
  Dependency failed for mnt-nextcloud.mount - /mnt/nextcloud.
  mnt-nextcloud.mount: Job mnt-nextcloud.mount/start failed with result 'dependency'.
  ```
- `sudo dmesg | grep -i sdb` showed the disk was detected fast during boot (~0.56s) — ruled out a slow/late-appearing device as the cause
- Manually mounting worked fine (`sudo mount /dev/sdb1 /mnt/nextcloud`), and dmesg then showed the same `mounting fs with errors` warning

## Diagnosis

1. Confirmed fstab/lsblk were correct — not a config issue.
2. `journalctl -b -u mnt-nextcloud.mount` showed a **dependency** failure, not a timeout — pointed at something the mount unit depends on, not the device itself.
3. `sudo dmesg | grep -i sdb` showed the disk enumerated well before boot would reach `local-fs.target`, ruling out a race with device detection.
4. The `mounting fs with errors` kernel message plus `pass=2` in fstab connected the dots: the automatic `systemd-fsck@dev-disk-by\x2duuid-...` service run at boot fails on a dirty filesystem, and `mnt-nextcloud.mount` depends on that fsck service succeeding.

## Fix

**Repaired the filesystem** (unmounted first):

```bash
sudo umount /mnt/nextcloud
sudo e2fsck -f /dev/sdb1
```

`e2fsck` found no actual corruption — the five passes completed clean with no fixes reported. Running it anyway clears the superblock's error flag, which is what was blocking the boot-time fsck/mount.

**Added `nofail` to the fstab entry** as a safety net, so a future recurrence of the dirty flag degrades to "disk not mounted" instead of blocking the mount unit / boot:

```
UUID=660b0a6c-c105-4cf9-9827-3950ceca5bd4 /mnt/nextcloud ext4 defaults,nofail 0 2
```

After `e2fsck` + `nofail`, rebooted the VM and confirmed `/mnt/nextcloud` mounted automatically.

## Update — 2026-07-17: a further root cause found (Proxmox host double-mounting this disk)

While investigating a separate issue (`vzdump` freezing the whole Proxmox host — see [Proxmox host freeze during VM backup](./proxmox-vzdump-backup-freeze-failing-disk.md)), found something that changes the picture for this disk specifically: the Proxmox **host itself** was mounting this same physical disk, at the same time the VM was mounting it internally.

The host's own `/etc/fstab` (not the VM's) had:
```
UUID=660b0a6c-c105-4cf9-9827-3950ceca5bd4  /mnt/nextcloud  ext4  defaults,nofail  0  2
```
That UUID is this exact disk. `mount | grep nextcloud` on the host confirmed it was actively mounted there:
```
/dev/sda1 on /mnt/nextcloud type ext4 (rw,relatime,stripe=8191)
```
VM 102's config passes this disk through raw (`scsi1: /dev/disk/by-id/ata-KINGSTON_SA400S37960G_50026B7687896926`), and the guest mounts the same UUID internally as `/dev/sdb1`. So two independent kernels — host and guest — were mounting the same ext4 filesystem at once, with zero coordination between them. That's very likely the real explanation for the dirty-ext4 flag recurring on every reboot, not just "unclean shutdown" as originally assumed above. The `nofail` fix kept it from blocking boot, but never touched the actual double-mount, because nobody knew it existed yet.

**Fix:**
```bash
umount /mnt/nextcloud
```
Removed the line from the Proxmox **host's** `/etc/fstab`. The host no longer mounts this disk at all — it's left exclusively to the VM, which is what passthrough is supposed to mean.

## Update — 2026-07-18: recurred again after a hard reboot

The Proxmox host froze during another `vzdump` attempt (unrelated failing disk, see the linked runbook) and needed a hard reboot. After it came back up, the Nextcloud VM had the exact same automount failure again — disk not mounted, needed manual recovery:

```
lsblk -f
sdb
└─sdb1  ext4  1.0  660b0a6c-c105-4cf9-9827-3950ceca5bd4        (no MOUNTPOINTS)

sudo e2fsck -f /dev/sdb1
# Superblock needs_recovery flag is clear, but journal has data.
# Run journal anyway? yes
# ...clean, no corruption found

sudo mount -a
```

This is **not** a sign the double-mount fix failed — it's the expected behavior of the `nofail` fix from the original incident: a hard/unclean shutdown still leaves the ext4 journal in a state the boot-time `systemd-fsck` won't auto-recover, so with `nofail` the mount unit just skips the mount instead of blocking boot. It still takes a manual `e2fsck -f` + `mount -a` (or a reboot after fixing) every time there's an unclean shutdown — the underlying trigger this time was the Proxmox backup freeze, not this disk.

Confirms two things going forward: this disk's automount is only as reliable as the host's uptime, and the real fix for *this* symptom is either (a) get `vzdump` to stop freezing the host (see the linked runbook, still unresolved as of 2026-07-18), or (b) automate the recovery — see the script idea in Lesson below.

Environment for reference: Nextcloud server, data mount `/mnt/nextcloud`, disk `/dev/sdb1`, ext4, `pass=2` in fstab.

## Lesson

- A dirty ext4 flag blocking automount isn't always caused by "just an unclean shutdown" — check whether something else is also touching the same disk. In this case the Proxmox host itself was double-mounting the disk via its own `/etc/fstab`, independent of the VM's passthrough mount; that's the more likely root cause of the dirty flag recurring at all. Audit the host's `/etc/fstab` for any UUID that also appears in a VM's passthrough config.
- The `nofail` fix genuinely works (it stops the failure from blocking boot), but it doesn't make the disk self-heal — every unclean shutdown still needs a manual `e2fsck -f` + `mount -a` afterward. Worth writing a small script/systemd unit that detects an unmounted-but-configured disk and runs the fsck+mount automatically, instead of doing it by hand each time.
- Since this disk's automount reliability is downstream of the Proxmox host staying up cleanly, the `vzdump` freeze issue (separate runbook) is worth resolving fully — every freeze-and-hard-reboot cycle is another chance for this to recur.
