# Moved: seed data now lives in /seeds/dev_seed.sql (DEV ONLY)

This file is kept only as a pointer. The final dev seed is:

    seeds/dev_seed.sql

It is NOT a migration. Never run it on the live project.
Run instructions and guards (app.env = 'dev', no owner profile, no classes)
are documented inside that file and in README_MIGRATIONS.md.
