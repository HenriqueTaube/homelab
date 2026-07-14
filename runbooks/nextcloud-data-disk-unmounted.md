# Nextcloud — data disk unmounted after unclean filesystem state

## What happened

Users opened Nextcloud and their files appeared to be missing — folders showed up empty. The files were still on disk the whole time; Nextcloud just couldn't see them because the data disk, `/dev/sdb1`, was no longer mounted at `/mnt/nextcloud`.

**Root cause:** the `ext4` filesystem on `/dev/sdb1` was in a dirty state after an unclean shutdown/disconnect, so it came up unmounted. The exact trigger (power loss, cable/adapter issue, unclean shutdown) wasn't confirmed from the available logs — the kernel only recorded that the filesystem had errors and needed `e2fsck`.

## Symptoms

- Users reported empty folders in Nextcloud
- Files still existed on disk, but were invisible to the application
- `mount` showed `/mnt/nextcloud` not mounted
- Kernel log: `EXT4-fs (sdb1): warning: mounting fs with errors, running e2fsck is recommended`

## Diagnosis

### 1. Checked the mount — data disk was gone

```bash
ssh nextcloud@<nextcloud-ip>
mount
```

`/dev/sdb1` was missing from the mounted filesystems. `/mnt/nextcloud` still existed as a path, but empty — that's why Nextcloud showed no files instead of an error.

### 2. Checked kernel logs — filesystem was dirty

```bash
journalctl -k | grep -i -E 'sdb|ext4|I/O error|reset|disconnect|abort|failed'
```

```
EXT4-fs (sdb1): warning: mounting fs with errors, running e2fsck is recommended
```

Confirmed the filesystem wasn't cleanly unmounted before whatever caused the disk to drop — needs `e2fsck` before trusting it long-term.

## Fix

**Mount the disk again:**

```bash
sudo mount /dev/sdb1 /mnt/nextcloud
mount | grep /mnt/nextcloud
```

**Force Nextcloud to rescan all files** — mounting the disk back doesn't refresh Nextcloud's file cache by itself:

```bash
sudo -u www-data php /var/www/nextcloud/occ files:scan --all
```

Files reappeared in the UI after this.

**Repair the filesystem** (during a maintenance window, disk unmounted — the kernel had flagged errors so this shouldn't be skipped):

```bash
sudo umount /mnt/nextcloud
sudo e2fsck -f /dev/sdb1
# or, for automatic fixes:
sudo e2fsck -fy /dev/sdb1
sudo mount /dev/sdb1 /mnt/nextcloud
```

## Open question — why doesn't the disk mount at boot?

Still don't know why `/dev/sdb1` isn't coming back mounted on its own after a reboot — no clear cause identified yet, not just "why did it get dirty" but why it doesn't just remount cleanly at boot like it should. Worth checking `/etc/fstab` for that entry next time (whether it's there at all, and if the options are right), but not confirmed as the cause — keeping an eye on this to actually figure it out next time it happens rather than just re-mounting and moving on.

## Lesson

- An unmounted data disk under Nextcloud doesn't show an error — it just makes files look deleted. Empty folders reported by users are a first sign to check `mount`, not to assume data loss.
- Always run `occ files:scan --all` after remounting — Nextcloud's file cache doesn't refresh on its own.
- If `/dev/sdb1` drops again, check power, cabling, and USB/SATA adapter — the trigger wasn't confirmed this time, so it's worth watching for a recurrence.
- Root cause of why it doesn't auto-mount at boot is still unknown — see "Open question" above. Next occurrence, check `/etc/fstab` and boot logs before just remounting.
- Environment for reference: Nextcloud server, data mount `/mnt/nextcloud`, disk `/dev/sdb1`, ext4.
