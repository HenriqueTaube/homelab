# Grafana Alloy — Knots VM

Grafana Alloy agent shipping logs to Loki in the Kubernetes cluster.

## Overview

| Item | Value |
|------|-------|
| Config | `/etc/alloy/config.alloy` |
| Loki endpoint | `http://192.168.1.192:3100` |

## Log sources

| Job | Path | Description |
|-----|------|-------------|
| `bitcoind` | `/mnt/knots/.bitcoin/debug.log` | Bitcoin Knots node logs |
| `electrs` | `/var/log/electrs.log` | Electrs logs |
| `syslog_knots` | `/var/log/syslog` | System logs |
| `authlog` | `/var/log/auth.log` | SSH / auth logs |
