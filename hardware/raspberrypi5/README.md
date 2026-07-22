# Raspberry Pi 5

Raspberry Pi 5 running as `worker-rasp` — Kubernetes worker node in the homelab cluster.

## Specs

| | |
|-|--|
| Model | Raspberry Pi 5 |
| RAM | 8 GB |
| OS | Talos OS |
| Role | Kubernetes worker (worker-rasp) |
| IP | 192.168.1.91 |

## Accessories

- **Power supply** — 5A USB-C (large, dedicated supply for stability)
- **Ugreen USB hub** — external powered hub
- **120GB SSD** — in a USB enclosure, used as Longhorn storage (`/var/mnt/ssd/longhorn`)
- **Custom 3D printed case** — designed in SolidWorks and printed on a 3D printer

## Storage

The 120GB SSD connected via USB is the Longhorn disk for this node. Longhorn uses it to store volume replicas for the Kubernetes cluster.

See [`kubernetes/longhorn/`](../../kubernetes/longhorn/README.md) for details on the storage setup.

## Build

<!-- Add photos here after taking them -->
