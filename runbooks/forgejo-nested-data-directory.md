# Forgejo — Nested data directory after tar restore

## Context

When restoring Forgejo app data from the VM into the Kubernetes PVC using tar, the directory layout ended up with an extra level.

## Symptom

Forgejo could not find repositories and data. The actual layout was:

```
/data/data/data/forgejo-repositories
```

instead of the expected:

```
/data/data/forgejo-repositories
```

## Root cause

The tar backup included the parent path. Extracting it into `/data` added an extra `data/` level, resulting in a double-nested structure.

## Fix

Updated `app.ini` to point to the real paths where the data actually ended up:

```ini
WORK_PATH     = /data/gitea
APP_DATA_PATH = /data/data
ROOT          = /data/data/data/forgejo-repositories
ROOT_PATH     = /data/log
```

## Lesson

When restoring with tar into a PVC, check what path is included in the archive first:

```bash
tar -tf backup.tar.gz | head -20
```

Extract with `--strip-components` if needed to avoid the extra directory level.
