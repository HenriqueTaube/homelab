# Longhorn — Backup target unavailable after network outage

## What happened

After the ISP switched the connection to CGNAT (see [wireguard-cgnat-after-power-outage.md](./wireguard-cgnat-after-power-outage.md)), the NFS server on the Nextcloud VM stopped working. Longhorn uses NFS as the backup target, so backups silently stopped running.

## Symptom

In the Longhorn dashboard, the last backup was 4+ days ago — expected is every 2 days from the recurring cronjob.

## Diagnosis

### 1. Triggered the backup cronjob manually in k9s

In k9s, went to `:cronjob`, selected the `backups` cronjob and triggered it manually. The pod completed successfully — but no new backup appeared in the dashboard.

This meant the problem was not the cronjob itself but the backup target.

### 2. Checked NFS on the Nextcloud VM

```bash
ssh nextcloud@192.168.1.224
sudo systemctl status nfs-server.service
```

Output: **inactive** — the NFS server had stopped after the power outage and network disruption.

## Fix

```bash
sudo systemctl restart nfs-server.service
```

After restarting, the backup target in the Longhorn dashboard changed from unavailable to **available**. Triggered the cronjob again and the backup completed successfully.

## Lesson

After any power outage or network disruption, check the NFS server on the Nextcloud VM — it may have stopped. Longhorn backup jobs will complete without errors but produce no backup if the NFS target is unavailable.

Quick check:

```bash
ssh nextcloud@192.168.1.224 'sudo systemctl status nfs-server.service'
```
