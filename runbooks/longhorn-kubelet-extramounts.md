# Longhorn — Volumes fail to mount without kubelet extraMounts

## Symptom

Even after installing Talos system extensions, some volumes failed to attach or mount correctly on workers. Longhorn appeared healthy but volume propagation silently failed.

## Root cause

On Talos, `kubelet` runs inside a container. For Longhorn to propagate mounts correctly between the host and the kubelet, `extraMounts` with `rshared` propagation must be configured explicitly in the worker machine config.

## Fix

Add the following to `machine.kubelet` in both worker node configs (`worker-prox.yaml` and `worker-rasp.yaml`) in the gitops repo:

```yaml
machine:
  kubelet:
    extraMounts:
      - destination: /var/lib/longhorn
        type: bind
        source: /var/lib/longhorn
        options:
          - bind
          - rshared
          - rw
```

Apply and reboot each worker:

```bash
talosctl -e 192.168.1.113 -n 192.168.1.152 apply-config --file worker-prox.yaml
talosctl -e 192.168.1.113 -n 192.168.1.91 apply-config --file worker-rasp.yaml
```

## Lesson

Without `extraMounts` and `rshared`, Longhorn installs without errors but volume mount propagation silently fails. This is a Talos-specific requirement not mentioned in the standard Longhorn installation guide.
