# CloudNativePG

PostgreSQL operator for the Kubernetes cluster. Manages PostgreSQL as a native Kubernetes resource — pods, PVCs, services, and replication are all handled automatically by the operator.

Manifests are managed in the [gitops](https://github.com/chtaube/gitops) repo under `platform/grafana`.

## Stack

| Component | Details |
|-----------|---------|
| Operator | `ghcr.io/cloudnative-pg/cloudnative-pg:1.29.0` |
| Operator namespace | `cnpg-system` |
| PostgreSQL | version 17 |
| Cluster | `pg-grafana-longhorn` (namespace `grafana-longhorn-db`) |
| Instances | 2 (primary + replica) |
| Storage | Longhorn `longhorn-2` StorageClass (20Gi per instance) |

## Why

Grafana originally used SQLite stored on an NFS PVC. This caused intermittent slowness — SQLite over NFS is unreliable under load. CloudNativePG was chosen to replace it with a proper managed PostgreSQL.

Benefits:
- 2 instances replicated across both nodes via Longhorn
- Pod is recreated automatically by Kubernetes if it dies
- Configuration is declared in YAML — fits the GitOps model

## Installation

Install the operator via the official manifest:

```bash
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.0.yaml
```

Label the namespace as privileged (required on Talos):

```bash
kubectl label namespace cnpg-system \
  pod-security.kubernetes.io/enforce=privileged \
  pod-security.kubernetes.io/enforce-version=latest \
  --overwrite
```

Apply the cluster:

```bash
kubectl apply -f config/cluster.yaml
```

## Cluster

The Grafana PostgreSQL cluster is defined in `config/cluster.yaml`:

| Setting | Value |
|---------|-------|
| Name | `pg-grafana-longhorn` |
| Namespace | `grafana-longhorn-db` |
| Database | `grafana` |
| User | `grafana` |
| Password | stored in Kubernetes Secret `grafana-secret` (gitops repo) |
| Primary | `pg-grafana-longhorn-1` |
| Replica | `pg-grafana-longhorn-3` |

## Services

| Service | Purpose |
|---------|---------|
| `pg-grafana-longhorn-rw` | read/write — used by Grafana |
| `pg-grafana-longhorn-ro` | read-only |
| `pg-grafana-longhorn-r` | internal |

Grafana connects to:
```
pg-grafana-longhorn-rw.grafana-longhorn-db.svc.cluster.local:5432

