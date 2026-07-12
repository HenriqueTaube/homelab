# Nextcloud Backup — Borg

Automated backup using BorgBackup, triggered by a systemd timer every 48h.

## Overview

| Item | Value |
|------|-------|
| Tool | BorgBackup |
| Repo | `/srv/backup/nextcloud/borg` (local disk on VM) |
| Source | `/mnt/nextcloud` (Nextcloud data directory) |
| Schedule | Every 48h (`timerbackup.timer`) |
| Retention | Last 2 archives |
| Log | `/var/log/backupnextcloud.log` |
| Password | `/root/.borgpass` |

## Files

| File | Location on VM | Purpose |
|------|---------------|---------|
| `backupnextcloud` | `/usr/local/sbin/backupnextcloud` | Backup script |
| `timerbackup.service` | `/etc/systemd/system/timerbackup.service` | Systemd service |
| `timerbackup.timer` | `/etc/systemd/system/timerbackup.timer` | Systemd timer (every 48h) |

## What gets backed up

- Nextcloud data directory (`/mnt/nextcloud`)

> **Note:** The MariaDB database is **not** included in this backup. For a full recovery you also need a DB dump.

## Install on a fresh VM

```bash
# 1. Install Borg
sudo apt install borgbackup

# 2. Initialize the repo
sudo borg init --encryption=repokey /srv/backup/nextcloud/borg

# 3. Save the passphrase
sudo bash -c 'echo "your-passphrase" > /root/.borgpass'
sudo chmod 600 /root/.borgpass

# 4. Copy the script
sudo cp backupnextcloud /usr/local/sbin/backupnextcloud
sudo chmod +x /usr/local/sbin/backupnextcloud

# 5. Install and enable the systemd units
sudo cp timerbackup.service timerbackup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now timerbackup.timer
```

## Limitations

- Backup is **local only** — if the VM disk dies, the backup is lost too
- Only **2 archives** kept — no long-term history
- **Database not backed up** — add a `mysqldump` step to the script for full recovery capability
