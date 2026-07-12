# CloudNativePG Installation

## Install the operator

```bash
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.0.yaml
```

## Label the namespace as privileged (required on Talos)

```bash
kubectl label namespace cnpg-system \
  pod-security.kubernetes.io/enforce=privileged \
  pod-security.kubernetes.io/enforce-version=latest \
  --overwrite
```

## Apply the cluster

```bash
kubectl apply -f cluster.yaml
```
