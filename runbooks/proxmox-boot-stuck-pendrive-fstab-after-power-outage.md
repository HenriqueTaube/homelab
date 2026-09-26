# Proxmox host stuck at boot after power outage — `/mnt/pendrive` fstab mount failed

> Related: the pendrive is the local `vzdump` backup target set up in [Proxmox host freeze during VM backup](./proxmox-vzdump-backup-freeze-failing-disk.md). Same class of problem as [Nextcloud data disk not automounting after Proxmox host reboot](./nextcloud-data-disk-not-automounting-boot.md): a non-essential disk in fstab without `nofail`, after an unclean shutdown.

## What happened

A power outage took down both the Proxmox host (amd64) and the ISP modem/router. When power came back, the internet on the home network wouldn't work: devices didn't get an IP (`ip a` showed no normal LAN address).

Called the ISP and asked them to turn the modem's default DNS back on. After that the network worked again, but the actual cause was still unknown.

The Proxmox host *looked* like it was running normally (powered on, fans, lights), but it wasn't getting an IP either. Plugged an HDMI monitor into it and saw the boot had stopped on:

```
Timed out ... Failed to mount /mnt/pendrive
```

`/mnt/pendrive` is the USB pendrive used as the local `vzdump` backup target. Because its fstab entry failed, boot never got past `local-fs.target`, so the host dropped into emergency mode. The network (`vmbr0`) and all VMs never started.

**Status: fixed and booting normally. fstab hardened (`UUID=` + `nofail` + short device timeout) so this can't block boot again, but the root cause of the original mount failure is not confirmed.** See [Open question](#open-question--why-did-the-mount-fail) below.

## Symptoms

- After the power outage, LAN devices had no IP / no working internet
- Fixed on the network side by the ISP re-enabling the modem's default DNS
- Proxmox host powered on and looked normal, but had no network: no web UI, no SSH, no ping
- On the host's physical console (HDMI): boot stopped with `Failed to mount /mnt/pendrive`, then emergency mode
- After removing the fstab line the host booted normally
- After putting the same line back, `mount -a` worked and a reboot also worked. **The failure didn't happen again.**

## Diagnosis

### 1. Network down — fixed by the ISP, but that was a side effect

LAN clients got no IP and no working DNS. The ISP re-enabled the modem's default DNS and that got the network back.

**Likely connection to the Proxmox failure (not confirmed):** Pi-hole runs as a VM (104) on this Proxmox host. If the modem was handing out Pi-hole as the LAN DNS server (or Pi-hole was also the DHCP server), then the host being stuck in emergency mode meant **Pi-hole was down**, which takes DNS (and possibly DHCP) down for the whole network. That fits "no IP + no internet" exactly, and explains why switching the modem back to its own default DNS fixed it. Check the modem's LAN/DHCP settings and the Pi-hole DHCP setting to confirm (see Lesson).

### 2. Proxmox host had no IP — plugged in HDMI

From the network the host looked dead, but it was physically on. A monitor showed the real state: stuck at boot on the `/mnt/pendrive` mount.

A regular fstab entry (no `nofail`) is a hard dependency of `local-fs.target`. If the mount fails or times out (default device timeout is 90s), systemd stops the boot and drops into emergency mode. Networking, `pve-cluster` and the VMs never start.

### 3. Removed the fstab line from GRUB — host booted

Went into GRUB, got a shell, edited `/etc/fstab`, and removed (commented out) the `/mnt/pendrive` line. Rebooted and the host came up normally, with network and VMs.

For next time, one way to do this from GRUB:

```bash
# At the GRUB menu: press 'e' on the Proxmox entry, go to the line starting with 'linux',
# add this at the end, then press Ctrl+X to boot:
systemd.unit=emergency.target
# (or init=/bin/bash if emergency mode asks for a root password you don't have)

# In the shell:
mount -o remount,rw /
nano /etc/fstab        # comment out the /mnt/pendrive line
sync
reboot -f
```

### 4. Put the line back — mounted and rebooted fine

After the host was up, put the original line back in `/etc/fstab`:

```bash
mount -a        # mounted /mnt/pendrive with no errors
reboot          # booted normally, pendrive mounted
```

Since the same fstab line works now, **the fstab line itself isn't wrong in general**. It failed under the conditions of that one boot, right after the power outage.

## Fix

- Removed the `/mnt/pendrive` fstab line to get the host booting, then put it back (`mount -a` + reboot both worked).
- ISP re-enabled the modem's default DNS, which brought the LAN back.

**Applied (prevents a repeat):** changed the pendrive's fstab entry to use its UUID, `nofail`, and a short device timeout. Now a missing or broken pendrive only means "backup target not mounted", not "whole host doesn't boot":

```
UUID=<pendrive-uuid>  /mnt/pendrive  ext4  defaults,nofail,x-systemd.device-timeout=10s  0  2
```

- `UUID=` instead of `/dev/sdX1`: device letters can change between boots, the UUID doesn't
- `nofail`: if the mount fails, boot continues without it instead of dropping into emergency mode
- `x-systemd.device-timeout=10s`: wait 10s for the pendrive instead of the default 90s
- `0 2`: keep the boot-time fsck. With `nofail`, a failed fsck no longer blocks boot

Applied and tested before rebooting:

```bash
blkid | grep -i ext4           # get the pendrive UUID
cp /etc/fstab /etc/fstab.bak
nano /etc/fstab                # replace the /mnt/pendrive line
systemctl daemon-reload
umount /mnt/pendrive
mount -a
findmnt /mnt/pendrive          # pendrive mounted
```

**Recommended, not confirmed as done:** if the pendrive is a Proxmox `dir` storage, also mark it as a mountpoint. Otherwise, when the pendrive isn't mounted, `vzdump` writes the backup into the empty `/mnt/pendrive` folder **on the root disk** and can fill it up:

```bash
pvesm set <storage-id> --is_mountpoint yes
```

## Open question — why did the mount fail?

Not confirmed yet. These are the likely causes, most likely first, and how to check each one:

1. **fstab uses a device name (`/dev/sdX1`) instead of a UUID.** This host has several disks (the Longhorn disk already moved `sde` → `sdc` once) plus USB devices. Their order isn't guaranteed across boots. If the pendrive came up with a different letter after the outage, the device in fstab never showed up, giving `Timed out waiting for device` → mount failure. A later normal reboot got the "right" order again by luck, which matches "put the line back and it worked".
   ```bash
   grep pendrive /etc/fstab     # /dev/sdX or UUID=?
   lsblk -f                     # which letter the pendrive has now
   ```

2. **Dirty ext4 from the unclean shutdown.** The power cut hit while the pendrive was mounted. With `pass=2` in fstab, boot-time `systemd-fsck` runs on it. A dirty journal can make that automatic fsck fail, and the mount unit then fails with `dependency`. This is the same way the Nextcloud disk failed. The later `mount -a` would have replayed the journal and cleaned it, which also matches "worked afterwards".
   ```bash
   tune2fs -l /dev/<pendrive> | grep -iE 'state|last checked|mount count'
   ```

3. **USB pendrive slow to show up after a cold power-on.** After a full power loss, USB devices sometimes take longer to enumerate, or a cheap pendrive needs a moment to power up. If it showed up after systemd's device timeout, the mount failed.
   ```bash
   dmesg | grep -iE 'usb|sd[a-z]'   # when the pendrive was detected on this boot
   ```

**Check the logs of the failed boot first.** They may answer this directly, if the journal was saved to disk during that boot (in emergency mode it may not have been):

```bash
journalctl --list-boots                        # find the boot right after the outage
journalctl -b <boot-id> -p warning | grep -iE 'pendrive|fsck|timed out|dependency|sd[a-z]'
journalctl -b <boot-id> -u mnt-pendrive.mount
```

What each message means:
- `Timed out waiting for device /dev/...` → cause 1 or 3 (device never showed up or was late)
- `Dependency failed for /mnt/pendrive` + a failed `systemd-fsck@...` → cause 2 (dirty filesystem)
- Nothing saved for that boot → can't tell from logs. The `nofail` fix above makes the exact cause less critical, because it can no longer block boot

## Lesson

**Any disk in fstab that the host doesn't need to boot must have `nofail`.** Backup pendrives, data disks, NFS, USB drives: without `nofail`, one bad non-essential disk stops the whole hypervisor, and every VM on it goes down with it (including Pi-hole, which takes down DNS for the whole house).

**Use `UUID=` in fstab, never `/dev/sdX`.** Device letters change between boots on this host.

**If the Proxmox host "looks on" but has no IP, plug in a monitor first.** A host stuck in emergency mode looks exactly like a network problem from the outside.

**Don't make the LAN depend on a single VM.** If the modem hands out Pi-hole as the only DNS (or Pi-hole does DHCP), a Proxmox outage takes the whole network down. Options:
- Set a fallback/secondary DNS in the modem's DHCP settings
- Keep DHCP on the modem, not on Pi-hole

After a power outage, check in this order:

1. Is the Proxmox host actually booted? Check the console/HDMI, not just the power light
2. If stuck on a mount, boot from GRUB into emergency mode and comment out the failing fstab line
3. Is Pi-hole (VM 104) up? If not, the LAN has no DNS
4. WAN IP on the router: not `100.x.x.x` (CGNAT, see [WireGuard CGNAT runbook](./wireguard-cgnat-after-power-outage.md))

**Get a UPS (no-break) for the server and modem.** This is the third incident caused by a power outage.
