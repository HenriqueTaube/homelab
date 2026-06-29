# Longhorn — Volumes stuck in Degraded state

## Symptom

After creating the first PVCs, volumes showed status `Degraded` permanently even though Longhorn was running fine.

## Root cause

The default `longhorn` StorageClass from the official manifest sets `numberOfReplicas: "3"`. The cluster only has 2 nodes with Longhorn storage (`worker-prox` and `worker-rasp`), so the third replica could never be placed.

## What did NOT work

Editing the existing StorageClass in place — `StorageClass.parameters` is immutable in Kubernetes.

## Fix

Create a new StorageClass `longhorn-2` with `numberOfReplicas: "2"` (see `kubernetes/longhorn/config/storageclass.yaml`):

```bash
kubectl apply -f kubernetes/longhorn/config/storageclass.yaml
```

Then delete the degraded PVCs/pods and recreate them using `longhorn-2` as the `storageClassName`. Volumes moved from `Degraded` to `Healthy`.

## Lesson

Set `numberOfReplicas` equal to the number of nodes that have Longhorn storage. With 2 nodes, use 2 replicas. StorageClass parameters are immutable — always create a new class instead of editing the existing one.
