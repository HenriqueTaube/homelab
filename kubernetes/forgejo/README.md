# Forgejo

Self-hosted Git service and container registry. Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `apps/forgejo`.

## Stack

| Component | Details |
|-----------|---------|
| Namespace | `forgejo` |
| Image | `codeberg.org/forgejo/forgejo:14.0` |
| Database | MariaDB (`forgejo-mysql` service, namespace `forgejo`) |
| Storage | Longhorn RWX PVC |
| External IP | `192.168.1.191` (MetalLB LoadBalancer) |
| Port | `3000` (HTTP) |
| SSH | port `22` |
| URL | `http://192.168.1.191:3000` |

## Database

MariaDB was chosen over MySQL for collation compatibility — the original Forgejo VM used `utf8mb4_uca1400_as_cs` which only restores cleanly on MariaDB. See the [runbook](../../runbooks/forgejo-mariadb-collation.md).

| Setting | Value |
|---------|-------|
| Host | `forgejo-mysql:3306` |
| Database | `forgejo` |
| User | `forgejo` |
| Engine | MariaDB 11.6 |
| Storage | Longhorn (2 replicas) |

## Container registry

Forgejo also serves as a self-hosted container registry. Multi-arch images for personal projects are built and pushed here, keeping the full image supply chain self-hosted.

## Configuration

`app.ini` is stored in `config/app.ini` — **git-crypt encrypted** (contains database password and JWT secrets).

## Migration history

Forgejo went through 3 storage migrations:

```
Ubuntu Server VM → Kubernetes (local-path) → NFS → Longhorn
```

See the runbooks for the main incidents along the way:

| Runbook | Description |
|---------|-------------|
| [MariaDB collation](../../runbooks/forgejo-mariadb-collation.md) | MariaDB dump incompatible with MySQL 8 |
| [Nested data directory](../../runbooks/forgejo-nested-data-directory.md) | tar restore created extra directory level |
``
