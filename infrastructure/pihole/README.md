# Pi-hole

Network-wide ad blocker, DHCP server and local DNS — running on Ubuntu VM in Proxmox.

Combined with WireGuard VPN, all devices on the VPN also use Pi-hole for DNS, getting ad blocking and local DNS resolution even when away from home.

## Stack

```
devices / wireguard clients
        ↓
   Pi-hole :53        ← ad blocking + DHCP + local DNS
        ↓
   Unbound :5335      ← recursive resolver (no upstream like 8.8.8.8)
        ↓
   Root DNS servers   ← resolves directly, more private
```

| Component | Details |
|-----------|---------|
| VM | Proxmox (Ubuntu) |
| Pi-hole | v6.5 (FTL) |
| Upstream resolver | Unbound on `127.0.0.1:5335` |
| DNS port | 53 |
| Interface | `ens18` |
| DNS domain | `lan` |
| DNSSEC | enabled |
| IPv6 | enabled |

## DHCP

Pi-hole acts as the DHCP server for the whole network.

| Setting | Value |
|---------|-------|
| Range | `192.168.1.2` → `192.168.1.199` |
| Gateway | `192.168.1.1` |
| Subnet | `255.255.255.0` |
| NTP server | provided by Pi-hole |

### Static leases

| Hostname | IP |
|----------|----|
| desktop | 192.168.1.79 |
| impressora | 192.168.1.81 |
| controlplane | 192.168.1.113 |
| worker-prox | 192.168.1.152 |
| worker-rasp | 192.168.1.91 |
| henrique | 192.168.1.56 |

## Local DNS records

| Hostname | IP |
|----------|----|
| `forgejo.home.arpa` | `192.168.1.194` |

## Unbound

Recursive resolver — Pi-hole forwards all queries to Unbound instead of a public DNS (8.8.8.8, 1.1.1.1). Unbound resolves directly from root servers for better privacy.

| Setting | Value |
|---------|-------|
| Port | `5335` |
| DNSSEC | yes (harden-dnssec-stripped) |
| Prefetch | yes |
| Threads | 2 |
| Access | `127.0.0.0/8`, `192.168.1.0/24` |

## Config files

| File | Location on VM | Notes |
|------|---------------|-------|
| `config/pihole.toml` | `/etc/pihole/pihole.toml` | Main Pi-hole config — **git-crypt encrypted** |
| `config/dhcp.leases` | `/etc/pihole/dhcp.leases` | Active DHCP leases — **git-crypt encrypted** |
| `config/dnsmasq.conf` | `/etc/pihole/dnsmasq.conf` | Auto-generated dnsmasq config |
| `config/custom.list` | `/etc/pihole/custom.list` | Custom local DNS entries |
| `config/unbound.conf` | `/etc/unbound/unbound.conf` | Unbound recursive resolver config |

## WireGuard integration

WireGuard clients are configured to use Pi-hole's IP as their DNS server. This means:
- Ad blocking works on all devices even outside the home network
- Local hostnames (`.home.arpa`, `.lan`) resolve correctly over VPN
- All DNS traffic goes through Unbound — no leaks to public resolvers

