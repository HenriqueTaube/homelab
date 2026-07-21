# Talos

Talos OS running on the Kubernetes nodes provisioned via Proxmox VMs and Raspberry Pi.

## Nodes

| Node | VM | Role | IP |
|------|----|------|----|
| controlplane | Proxmox VM 107 | Controlplane | 192.168.1.113 |
| worker-prox | Proxmox VM 108 | Worker | 192.168.1.152 |
| worker-rasp | Raspberry Pi | Worker | 192.168.1.91 |

## Image Factory

Custom Talos image built via [Image Factory](https://factory.talos.dev) with the following extensions:

| Extension | Purpose |
|-----------|---------|
| `siderolabs/iscsi-tools` | Required by Longhorn |
| `siderolabs/util-linux-tools` | Required by Longhorn |

Schematic in `config/talos-schematic.yaml`.

## Config files

| File | Description | Encrypted |
|------|-------------|-----------|
| `config/controlplane.yaml` | Controlplane machine config | git-crypt |
| `config/worker-prox.yaml` | Worker (Proxmox VM) machine config | git-crypt |
| `config/worker-rasp.yaml` | Worker (Raspberry Pi) machine config | git-crypt |
| `config/talosconfig` | Talos client config (`talosctl`) | git-crypt |
| `config/kubeconfig` | Kubernetes client config (`kubectl`) | git-crypt |
| `config/talos-schematic.yaml` | Image Factory schematic | no |

All machine configs contain certificates and keys — encrypted with git-crypt.

## Apply config to a node

```bash
talosctl apply-config --insecure --nodes <node-ip> --file config/controlplane.yaml
talosctl apply-config --insecure --nodes <node-ip> --file config/worker-prox.yaml
```
