# Grafana

Grafana running in the Kubernetes cluster on Talos OS. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `grafana` |
| Database | PostgreSQL via Longhorn (`pg-grafana-longhorn`) |
| Storage | Longhorn (2 replicas), backup on NFS at `192.168.1.224` |

## Database

Grafana uses PostgreSQL via CloudNativePG operator instead of the default SQLite.

| Setting | Value |
|---------|-------|
| Type | PostgreSQL |
| Host | `pg-grafana-longhorn-rw.grafana-longhorn-db.svc.cluster.local:5432` |
| Database | `grafana` |
| User | `grafana` |
| SSL | disabled |
| Password | stored in Kubernetes Secret (gitops repo) |

## Data sources

| Name | Type | URL |
|------|------|-----|
| loki | loki | `http://loki.loki.svc.cluster.local:3100` |

## Dashboards

| File | Description |
|------|-------------|
| `config/proxmox-1782525535186.json` | Proxmox node monitoring |
