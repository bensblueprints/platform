-- Slice 11, migration 0012: owner-managed settings (inference keys, GHL,
-- Stripe) settable from the UI instead of env vars. Single-owner plaintext
-- store (documented in USAGE.md); values are masked on read in the UI and
-- never logged.

create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;
