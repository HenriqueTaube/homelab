# Flux CD

GitOps controller for the Kubernetes cluster. Flux watches the [gitops](https://github.com/chtaube/gitops) repository and automatically reconciles the cluster state with what is declared there.

## Stack

| Component | Version |
|-----------|---------|
| Flux | `v2.8.6` |
| helm-controller | `v1.5.4` |
| kustomize-controller | `v1.8.4` |
| source-controller | `v1.8.3` |
| notification-controller | `v1.8.4` |
| Namespace | `flux-system` |

## How it works

Flux watches the `gitops` repo on GitHub at `clusters/homelab`. Any manifest pushed there is automatically applied to the cluster. HelmReleases are also reconciled by the helm-controller.

```
gitops repo (GitHub)
       ↓  every 1 min
  source-controller        ← pulls the repo
       ↓
  kustomize-controller     ← applies manifests
  helm-controller          ← installs Helm charts
```

## Bootstrap

To bootstrap Flux on a fresh cluster, fill in the token in `config/bootstrap-flux.sh` and run it:

```bash
sh config/bootstrap-flux.sh
```

The script:
1. Creates the `flux-system` namespace
2. Creates the `sops-age` secret for secrets decryption
3. Bootstraps Flux pointing to the `gitops` repo
