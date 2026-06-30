# Longhorn Installation

Longhorn v1.11.1 on Talos OS. The install has a few extra steps compared to a normal Kubernetes cluster because Talos is immutable and requires system extensions baked into the node image.

## 1. Prepare Talos nodes — system extensions

Longhorn needs `iscsi-tools` and `util-linux-tools` on the host. On Talos these cannot be installed — they must be baked into the node image via the Image Factory.

The schematic is at `config/talos-schematic.yaml`:

```yaml
customization:
  systemExtensions:
    officialExtensions:
      - siderolabs/iscsi-tools
      - siderolabs/util-linux-tools
```

Steps:

1. Submit the schematic to [factory.talos.dev](https://factory.talos.dev) and get the schematic ID
2. Upgrade both workers with the custom image:

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

3. Validate after upgrade:

```bash
talosctl -e 192.168.1.113 -n 192.168.1.152 get extensions
talosctl -e 192.168.1.113 -n 192.168.1.152 service iscsid
```

## 2. Prepare Talos nodes — kubelet extraMounts

Add `extraMounts` to `machine.kubelet` in both worker configs in the gitops repo:

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

Apply to each worker:

```bash
talosctl -e 192.168.1.113 -n 192.168.1.152 apply-config --file worker-prox.yaml
talosctl -e 192.168.1.113 -n 192.168.1.91 apply-config --file worker-rasp.yaml
```

## 3. Install Longhorn

Apply the official manifest:

```bash
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.11.1/deploy/longhorn.yaml
```

## 4. Fix PodSecurity

Label the `longhorn-system` namespace as privileged — without this `longhorn-manager` fails to start:

```bash
kubectl label namespace longhorn-system \
  pod-security.kubernetes.io/enforce=privileged \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/audit=privileged \
  pod-security.kubernetes.io/audit-version=latest \
  pod-security.kubernetes.io/warn=privileged \
  pod-security.kubernetes.io/warn-version=latest \
  --overwrite
```

Restart Longhorn workloads:

```bash
kubectl -n longhorn-system rollout restart daemonset/longhorn-manager
kubectl -n longhorn-system rollout restart deployment/longhorn-driver-deployer
kubectl -n longhorn-system rollout restart deployment/longhorn-ui
```

## 5. Create the StorageClass with 2 replicas

The default `longhorn` StorageClass uses 3 replicas — this cluster has 2 nodes so volumes would be permanently `Degraded`. Apply the custom StorageClass:

```bash
kubectl apply -f config/storageclass.yaml
```

This creates `longhorn-2` with `numberOfReplicas: "2"`. Use `longhorn-2` as `storageClassName` in all PVCs.

## 6. Access the UI

```bash
kubectl -n longhorn-system port-forward --address 0.0.0.0 svc/longhorn-frontend 8080:80
```

Open `http://127.0.0.1:8080`.

The `--address 0.0.0.0` flag exposes the port on all interfaces, useful when accessing from another machine on the network.

Shortcut in `~/.zshrc`:

```bash
klonghorn() {
    kubectl -n longhorn-system port-forward --address 0.0.0.0 svc/longhorn-frontend 8080:80
}
```

## Nodes with Longhorn storage

| Node | Disk | Mount |
|------|------|-------|
| `worker-prox` (`192.168.1.152`) | 500GB HDD | `/var/mnt/longhorn` |
| `worker-rasp` (`192.168.1.91`) | 120GB SSD | `/var/mnt/ssd/longhorn` |
