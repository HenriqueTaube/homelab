# WireGuard down after power outage — ISP switched to CGNAT

## What happened

Rained a lot, power went down at midnight. Router turned off and when it came back up the ISP gave a different IP.

In the morning websites were not loading and connections were failing.

## Diagnosis

### 1. Checked Unbound — red herring

Connected to the Pi-hole VM and saw this in Unbound logs:

```
warning: so-rcvbuf 1048576 was not granted. Got 425984
warning: subnetcache: prefetch is set but not working for data originating from subnet cache
```

Looks scary but **this is not the problem** — it's a harmless warning about socket buffer size. Unbound and Pi-hole were running fine.

### 2. Turned off WireGuard — websites came back

On the Arch laptop:

```bash
sudo wg-quick down wg0
```

Websites started loading normally. Confirmed WireGuard was the problem — traffic was going through the VPN tunnel to an endpoint that was unreachable.

### 3. Deleted WireGuard pod and triggered DuckDNS update

In k9s, deleted the WireGuard pod to force a restart. Then triggered the DuckDNS cronjob in Kubernetes to update the public IP.

Still not working.

### 4. Checked DuckDNS — IP looked correct

Opened the DuckDNS website and saw the registered IP starting with `186.x.x.x` — looked like a real public IP.

### 5. Checked the router — CGNAT detected

Opened the router admin page and saw the WAN IP starting with `100.x.x.x`.

**This is CGNAT** — the ISP put the connection behind a shared NAT. The IP `100.64.0.0/10` range is reserved for CGNAT. The DuckDNS was showing the ISP's public IP, not the real WAN IP assigned to the router — so WireGuard clients could never reach the endpoint.

## Fix

Called the ISP and requested to switch from CGNAT to a real public IP (no CGNAT).

After the ISP made the change, triggered the DuckDNS cronjob again in Kubernetes:

```bash
# in k9s or via kubectl
kubectl create job --from=cronjob/duckdns duckdns-manual -n <namespace>
```

DuckDNS updated with the real public IP. WireGuard came back up, all clients connected, websites loading normally.

## How to detect CGNAT fast

Check the router WAN IP — if it starts with `100.x.x.x` it is CGNAT:

```
100.64.0.0/10  →  CGNAT range (RFC 6598)
```

Also useful:

```bash
# check what IP the world sees
curl ifconfig.me

# compare with router WAN IP
# if they differ, probably behind CGNAT
```

## Lesson

After a power outage always check:

1. WAN IP on the router admin page — confirm it is not `100.x.x.x`
2. If CGNAT, call the ISP — request a real public IP
3. After ISP fixes it, trigger the DuckDNS cronjob manually to update the DNS record
4. Unbound `so-rcvbuf` warnings are harmless — do not waste time there
