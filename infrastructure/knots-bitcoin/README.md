# Bitcoin Knots

Bitcoin Knots full node with Electrs for personal wallet connection, running on Ubuntu VM in Proxmox.

## Stack

| Component | Details |
|-----------|---------|
| VM | Proxmox (Ubuntu) |
| Bitcoin node | Bitcoin Knots (`bitcoind`) |
| Wallet server | Electrs (Electrum Rust Server) |
| Index DB | RocksDB (used by electrs) |
| Electrum port | `0.0.0.0:50001` |

## Storage — LVM

Two SSDs joined into a single LVM volume group:

| Disk | Size | Role |
|------|------|------|
| `sdb` | 894GB | LVM physical volume |
| `sdc` | 931GB | LVM physical volume |
| `vg_knots` | 1.78TB | Volume group (both disks) |
| `lv_knots` | 1.78TB | Logical volume → `/mnt/knots` |

> No RAID — disks combined linearly for maximum space. If one disk dies, data is lost.

### Recreate LVM on a fresh install

```bash
sudo pvcreate /dev/sdb /dev/sdc
sudo vgcreate vg_knots /dev/sdb /dev/sdc
sudo lvcreate -l 100%FREE -n lv_knots vg_knots
sudo mkfs.ext4 /dev/vg_knots/lv_knots
sudo mkdir -p /mnt/knots
sudo mount /dev/vg_knots/lv_knots /mnt/knots

# Add to /etc/fstab for auto-mount
echo '/dev/vg_knots/lv_knots /mnt/knots ext4 defaults 0 2' | sudo tee -a /etc/fstab
```

## Data layout

```
/mnt/knots/
├── .bitcoin/     ← bitcoind data + debug.log
└── electrs/      ← electrs RocksDB index
```

## Config files

| File | Location on VM | Purpose |
|------|---------------|---------|
| `config/bitcoin.conf` | `/mnt/knots/.bitcoin/bitcoin.conf` | Bitcoin Knots config |
| `config/config.toml` | `/etc/electrs/config.toml` | Electrs config |

## Key settings

**bitcoind**
```
txindex=1        ← required by electrs
dbcache=2048     ← 2GB RAM cache for faster sync
maxconnections=40
```

**electrs**
```
daemon_rpc_addr = 127.0.0.1:8332   ← talks to bitcoind locally
electrum_rpc_addr = 0.0.0.0:50001  ← wallet connects here
```

## Observability

Logs shipped to Loki via Grafana Alloy — see [`alloy/`](./alloy/README.md).
