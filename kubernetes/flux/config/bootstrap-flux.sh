#!/usr/bin/env bash
# Bootstrap flux-system namespace, SOPS age secret, and Flux CD.
set -euo pipefail

# ─── Fill these before running ───────────────────────────────────────────────
GITHUB_USER="henriquetaube"
GITHUB_TOKEN="<YOUR_GITHUB_TOKEN>"
# ─────────────────────────────────────────────────────────────────────────────

echo "==> Creating flux-system namespace..."
kubectl create namespace flux-system

echo "==> Creating sops-age secret..."
kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=age.agekey=$HOME/.config/sops/age/keys.txt

echo "==> Bootstrapping Flux CD..."
export GITHUB_TOKEN=$GITHUB_TOKEN

flux bootstrap github \
  --owner=$GITHUB_USER \
  --repository=gitops \
  --branch=master \
  --path=clusters/homelab \
  --personal

echo "==> Done. Flux is reconciling the cluster."
echo "==> Watching reconciliation (ctrl+c to exit)..."
flux get kustomizations --watch
