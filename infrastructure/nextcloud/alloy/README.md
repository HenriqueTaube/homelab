# Grafana Alloy — Nextcloud VM

Grafana Alloy agent installed on the Nextcloud VM, shipping logs to Loki running in the Kubernetes cluster.

## Overview

| Item | Value |
|------|-------|
| Agent | Grafana Alloy |
| Config | `/etc/alloy/config.alloy` |
| Loki endpoint | `http://192.168.1.192:3100` |

## Log sources

| Job | Path | Description |
|-----|------|-------------|
| `nextcloud` | `/var/www/nextcloud/data/nextcloud.log` | Nextcloud application logs |
| `nextcloud_access` | `/var/log/apache2/nextcloud_access.log` | Apache HTTP access |
| `nextcloud_error` | `/var/log/apache2/nextcloud_error.log` | Apache HTTP errors |
| `nextcloud_ssl_access` | `/var/log/apache2/nextcloud_ssl_access.log` | Apache HTTPS access |
| `nextcloud_ssl_error` | `/var/log/apache2/nextcloud_ssl_error.log` | Apache HTTPS errors |
| `borg` | `/var/log/backupnextcloud.log` | Borg backup logs |
| `syslog` | `/var/log/syslog` | System logs |
| `authlog` | `/var/log/auth.log` | SSH / auth logs |

## Install on a fresh VM

```bash
# Install Alloy (Debian/Ubuntu)
sudo apt install gpg
wget -q -O - https://apt.grafana.com/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt update && sudo apt install alloy

# Copy config
sudo cp config.alloy /etc/alloy/config.alloy

# Enable and start
sudo systemctl enable --now alloy
```

## Useful commands

```bash
# Check status
systemctl status alloy

# Reload config without restart
sudo systemctl reload alloy

# View logs
journalctl -u alloy -f
```
