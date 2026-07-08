# Project memory

The deploy pipeline documentation lives at https://example.com/docs/deploy-pipeline
and must be consulted before every release. The team agreed on 2026-01-12 that
all database migrations require a rollback script committed in the same change.

Preferred build command:

```bash
bun run build --target=production
```

Remember that the staging environment uses the same configuration file as
production except for the DATABASE_URL environment variable, which points at
the staging cluster instead.
