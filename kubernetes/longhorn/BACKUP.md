# Longhorn Backups

Longhorn automatically backs up all volumes to NFS on the Nextcloud VM.

## Backup targets

| Name | URL | Status |
|------|-----|--------|
| `nfs` | `nfs://192.168.1.224:/srv/backup/nfs` | available |

## Recurring job

| Setting | Value |
|---------|-------|
| Name | `backups` |
| Schedule | `0 1 */2 * *` — every 2 days at 01:00 |
| Group | `default` (all volumes in this group are backed up) |
| Retain | 2 backups |
| Task | backup |
| Compression | lz4 |

All PVCs in the `default` group are backed up automatically. To add a volume to the group, set the label `recurring-job-group.longhorn.io/default: enabled` on the volume in the Longhorn UI.

## NFS path on Nextcloud VM

Backups land at `/srv/backup/nfs` on the Nextcloud VM (`192.168.1.224`).

```
