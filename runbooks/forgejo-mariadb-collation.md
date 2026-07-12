# Forgejo — MariaDB collation breaks restore on MySQL 8

## Context

When migrating Forgejo from a VM (running MariaDB) to Kubernetes, the database dump was restored into a `mysql:8` container.

## Symptom

The restore failed immediately — MySQL 8 did not recognize the collation used by the MariaDB dump:

```
Unknown collation: 'utf8mb4_uca1400_as_cs'
```

## Root cause

MariaDB creates tables with `utf8mb4_uca1400_as_cs` collation. MySQL 8 does not support this collation — they are different database engines despite the similar SQL syntax.

## Fix

Switch the cluster database from `mysql:8` to `mariadb:11.6`. The dump restored cleanly with the correct engine.

## Lesson

Always check the source database engine before planning the restore target. **A MariaDB dump is not always compatible with MySQL** — use MariaDB on both sides.
