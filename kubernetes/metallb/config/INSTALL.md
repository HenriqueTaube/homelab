# MetalLB Installation

MetalLB is managed by Flux via HelmRelease — it is installed automatically when Flux reconciles. The commands below are for manual installation if needed.

## Install via Helm

```bash
helm repo add metallb https://metallb.github.io/metallb
helm repo update

helm install metallb metallb/metallb \
  --namespace metallb-system \
  --create-namespace \
  --version 0.15.3
```

## Apply IP pool and L2 advertisement

```bash
kubectl apply -f config/pool.yaml
kubectl apply -f config/l2.yaml
```
