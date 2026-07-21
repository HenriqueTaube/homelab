# Proxmox

Proxmox VE hypervisor running all VMs and the Kubernetes nodes for the homelab.

## Host

| | |
|-|--|
| IP | `192.168.1.110` |
| Proxmox VE | 9.1.6 |
| Kernel | Linux 6.17.13-2-pve |
| CPU | Intel Core i5-8400 @ 2.80GHz — 6 cores, 1 socket |
| RAM | 24 GB |
| Boot disk | NVMe SSD 256 GB |
| Motherboard | Server-focused mini board (AliExpress) — 8x SATA ports |

## VMs

| ID | Name | CPU | RAM | OS Disk | Role |
|----|------|-----|-----|---------|------|
| 102 | nextcloud | 3 cores | 6 GB | 38G | Nextcloud + NFS server |
| 103 | knots | 4 cores | 8 GB | 64G | Bitcoin Knots full node |
| 104 | pihole | 2 cores | 2 GB | 16G | DNS / DHCP (Pi-hole) |
| 107 | controlplane | 4 cores | 4 GB | 32G | Talos Kubernetes controlplane |
| 108 | worker | 6 cores | 12 GB | 32G | Talos Kubernetes worker (worker-prox) |

VMs 107 and 108 run Talos OS — provisioned via nocloud ISO.

## Disks

| VM | Device | Disk | Size | Purpose |
|----|--------|------|------|---------|
| 102 | scsi1 | Kingston SA400S37 960GB | 960 GB | Nextcloud data |
| 102 | scsi3 | WDC WD10EURX 1TB | 1 TB | Nextcloud media |
| 103 | scsi1 | Kingston SA400S37 960GB | 960 GB | Bitcoin blockchain |
| 103 | scsi2 | Crucial BX500 1TB | 1 TB | Bitcoin blockchain overflow |
| 108 | scsi2 | Seagate ST500LM012 500GB | 500 GB | Longhorn replica (failing — to replace) |

All passthrough disks are connected via SATA directly to the motherboard.

## Network

Single bridge `vmbr0` on `192.168.1.110/24`, gateway `192.168.1.1`.  
DNS: Pi-hole at `192.168.1.233`.

## Backups

vzdump job every Sunday at 01:00, zstd compression, all VMs (102–108).  
Backup target: USB pendrive plugged directly into the host, formatted ext4.  
Retention: 2 backups.

NFS was tested as backup target but caused the host to freeze under sustained I/O — see runbook [proxmox-vzdump-backup-freeze-failing-disk](../../runbooks/proxmox-vzdump-backup-freeze-failing-disk.md).
