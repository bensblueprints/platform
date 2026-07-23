-- Slice 6, migration 0007: idempotent session materialization (spec §10).

create unique index if not exists sessions_webinar_starts_unique
  on sessions (webinar_id, starts_at);
