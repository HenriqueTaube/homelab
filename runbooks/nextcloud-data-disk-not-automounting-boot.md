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

Environment for reference: Nextcloud server, data mount `/mnt/nextcloud`, disk `/dev/sdb1`, ext4, `pass=2` in fstab.
