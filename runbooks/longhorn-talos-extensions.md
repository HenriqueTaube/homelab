# Longhorn — Requires Talos system extensions via Image Factory

## Symptom

After installing Longhorn manifests, volumes failed to attach. The Longhorn manager could not find required host-level binaries (`iscsiadm`, `blkid`).

## Root cause

Talos Linux does not allow installing packages on the host. Host-level tools must be baked into the node image via `systemExtensions` in a custom schematic — not applied via `talosctl apply-config`.

## Fix

**Step 1** — Use the schematic at `kubernetes/longhorn/config/talos-schematic.yaml`:

```yaml
customization:
  systemExtensions:
    officialExtensions:
      - siderolabs/iscsi-tools
      - siderolabs/util-linux-tools
```

**Step 2** — Submit the schematic to [Talos Image Factory](https://factory.talos.dev) and get a schematic ID.

**Step 3** — Upgrade both worker nodes to the custom image:

```bash
# worker-prox (amd64)
talosctl -e 192.168.1.113 -n 192.168.1.152 upgrade \
  --image factory.talos.dev/metal-installer/<SCHEMATIC_ID>:v1.12.6 \
  --wait

# worker-rasp (arm64)
talosctl -e 192.168.1.113 -n 192.168.1.91 upgrade \
  --image factory.talos.dev/metal-installer/<SCHEMATIC_ID>:v1.12.6 \
  --wait
```

> `connection reset by peer` during upgrade is normal — it happens during the node reboot.

**Step 4** — Validate extensions and `iscsid` after upgrade:

```bash
talosctl -e 192.168.1.113 -n 192.168.1.152 get extensions
talosctl -e 192.168.1.113 -n 192.168.1.152 service iscsid

talosctl -e 192.168.1.113 -n 192.168.1.91 get extensions
talosctl -e 192.168.1.113 -n 192.168.1.91 service iscsid
```

Expected: `siderolabs/iscsi-tools`, `siderolabs/util-linux-tools` listed, `iscsid` running.

## Lesson

On Talos, system-level dependencies cannot be installed via config patches. They require a custom node image built through the Image Factory. The schematic is architecture-independent — the same file works for both `amd64` and `arm64` nodes.
