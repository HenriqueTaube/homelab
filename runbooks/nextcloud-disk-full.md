# Runbook: Nextcloud Disk Full

## Incident Summary

While reorganizing files — copying a large folder to another location inside Nextcloud — the sync entered a repeated error loop. The Nextcloud web interface and desktop client both went down.

**Root cause:** The copy operation filled the Ubuntu VM disk. MariaDB (Nextcloud's database) ran out of space to write and crashed, taking down Nextcloud with it.

---

## Symptoms

- Nextcloud desktop client stuck in sync error loop
- Nextcloud web interface unavailable
- `journalctl` or MariaDB logs report: `no space left on device`

---

## Diagnosis

SSH into the Nextcloud VM from your laptop:

```bash
ssh nextcloud@192.168.1.224
```

Check which service is down:

```bash
systemctl status apache2
systemctl status mariadb
```

In this incident: Apache was running normally, MariaDB was crashed due to no disk space.

---

## Fix

### Step 1 — Resize the disk in Proxmox (pick one)

**Option A — Proxmox web dashboard:**

`Datacenter > VM 102 > Hardware > Hard Disk (scsi0) > Disk Action > Resize > +6G`

**Option B — Proxmox shell command:**

```bash
qm resize 102 scsi0 +6G
```

The disk goes from 32G → 38G. This only grows `sda`, not the partition inside the VM.

### Step 2 — Extend the partition inside the Ubuntu VM

SSH back into the VM and grow the partition `sda3` to use the new space:

```bash
sudo growpart /dev/sda 3
```

Verify it worked:

```bash
lsblk
```

### Step 3 — Resize the LVM physical volume

Tell LVM that the physical volume got bigger:

```bash
sudo pvresize /dev/sda3
```

Check the new free space:

```bash
sudo vgdisplay
```

### Step 4 — Extend the logical volume

Extend it to use all available free space:

```bash
sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
```

### Step 5 — Grow the filesystem

For ext4 (default Ubuntu):

```bash
sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
```

Confirm the disk now shows the new size:

```bash
df -h /
```

### Step 6 — Restart MariaDB and verify Nextcloud

```bash
sudo systemctl start mariadb
sudo systemctl status mariadb
sudo systemctl status apache2
```

Open the Nextcloud web interface and check the desktop client sync resumes.

## Environment

| Item | Value |
|------|-------|
| VM | Proxmox VM 102 |
| OS | Ubuntu (LVM layout) |
| Database | MariaDB |
| Web server | Apache2 |
| Disk before | 32G |
| Disk after | 38G (+6G) |
| Partition resized | sda3 |
| LVM volume group | ubuntu-vg |
| LVM logical volume | ubuntu-lv |
