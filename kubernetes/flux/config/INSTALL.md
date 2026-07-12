# Flux Installation

Flux is installed via the Flux CLI bootstrap command — not Helm. The bootstrap command installs Flux into the cluster AND connects it to the gitops GitHub repo in one step.

## Install the Flux CLI

```bash
curl -s https://fluxcd.io/install.sh | sudo bash
```

## Bootstrap Flux

Fill in `GITHUB_TOKEN` in `bootstrap-flux.sh` then run:

```bash
sh bootstrap-flux.sh
```

This will:
1. Create the `flux-system` namespace
2. Create the `sops-age` secret for SOPS decryption
3. Install Flux components into the cluster
4. Push `gotk-sync.yaml` to the gitops repo
5. Start reconciling the cluster from `clusters/homelab`
