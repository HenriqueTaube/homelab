# Longhorn — PodSecurity blocked longhorn-manager from starting

## Symptom

After applying Longhorn manifests, `longhorn-manager` failed with:

```
violates PodSecurity "baseline:latest"
```

## Root cause

Kubernetes enforces PodSecurity standards at the namespace level. Longhorn requires privileged access, which violates the default `baseline` policy on the `longhorn-system` namespace.

## Fix

Label the namespace as privileged:

```bash
kubectl label namespace longhorn-system \
  pod-security.kubernetes.io/enforce=privileged \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/audit=privileged \
  pod-security.kubernetes.io/audit-version=latest \
  pod-security.kubernetes.io/warn=privileged \
  pod-security.kubernetes.io/warn-version=latest \
  --overwrite
```

Then restart Longhorn workloads:

```bash
kubectl -n longhorn-system rollout restart daemonset/longhorn-manager
kubectl -n longhorn-system rollout restart deployment/longhorn-driver-deployer
kubectl -n longhorn-system rollout restart deployment/longhorn-ui
```

## Lesson

Apply the privileged label to `longhorn-system` before or immediately after installation — not after the pods start failing.
