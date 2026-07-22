# Intel AMD64

Self-built mini PC running Proxmox VE — hypervisor host for all VMs and Kubernetes nodes in the homelab.

## Specs

| | |
|-|--|
| CPU | Intel Core i5-8400 @ 2.80GHz — 6 cores, 1 socket |
| RAM | 24 GB |
| Boot disk | NVMe SSD 256 GB |
| Motherboard | [C246 ITX NAS Motherboard](https://aliexpress.com/item/1005009139151621.html) (AliExpress) |
| Case | [ITX case](https://aliexpress.com/item/1005008462821056.html) (AliExpress) |
| PSU | Corsair 400W (reused from old PC) |
| OS | Proxmox VE |
| IP | 192.168.1.110 |

## Motherboard

Mini-ITX board (170x170mm) built for NAS/server use, based on the Intel C246 chipset (LGA1151 socket).

| | |
|-|--|
| Chipset | Intel C246 |
| Socket | LGA1151 — Intel 8th/9th gen Core |
| RAM | 2x DDR4 DIMM — up to 64 GB (2666 MHz), ECC supported |
| SATA | 8x SATA 3.0 |
| M.2 |  M.2 NVMe 3.0 |
| PCIe | 1x PCIe 3.0 x16 |
| LAN | 4x Intel I226 2.5G |
| Video | 1x HDMI + 1x DisplayPort, both up to 4K60 |

See [`infrastructure/proxmox/`](../../infrastructure/proxmox/README.md) for VMs, passthrough disks, and backup details.

## Accessories

- **Custom 3D printed SSD support** — designed in SolidWorks and printed on a 3D printer, mounts a SATA SSD inside the case using the motherboard's spare SATA ports

## Build

Assembled from scratch — motherboard, case, and SSD support picked and put together, PSU reused from an old PC.

<!-- Add photos here after taking them -->
