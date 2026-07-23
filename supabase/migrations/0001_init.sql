-- Slice 1, migration 0001: core tables (spec §5).
-- tenant_id columns included now (nullable) per spec; tenant scoping arrives with the live spec.

create table webinars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  slug text unique not null,
  title text not null,
  subtitle text,
  broadcast_mode text not null default 'evergreen'
    check (broadcast_mode in ('evergreen','live','hybrid')),
  video_url text,
  video_r2_key text,
  duration_seconds int not null,
  thumbnail_url text,
  schedule_mode text not null check (schedule_mode in ('jit','recurring','ondemand')),
  jit_interval_minutes int default 15,
  jit_lead_minutes int default 5,
  recurring_days int[],
  recurring_times time[],
  timezone text default 'UTC',
  show_attendee_count boolean default true,
  allow_real_chat boolean default true,
  chat_variance_pct numeric default 0.10,
  chat_jitter_seconds int default 3,
  replay_enabled boolean default true,
  replay_window_hours int default 48,
  source_session_id uuid,
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  starts_at timestamptz not null,
  seed int not null,
  status text default 'scheduled',
  created_at timestamptz default now()
);
create index on sessions (webinar_id, starts_at);

create table registrants (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  email text not null,
  first_name text,
  phone text,
  timezone text,
  utm jsonb,
  access_token text unique not null,
  registered_at timestamptz default now()
);
create index on registrants (webinar_id, email);

create table attendances (
  id uuid primary key default gen_random_uuid(),
  registrant_id uuid references registrants(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  joined_at timestamptz default now(),
  join_offset_seconds int not null,
  last_heartbeat_at timestamptz,
  exit_offset_seconds int
);

-- Room reads authorize via registrants.access_token in application code, not
-- Supabase auth (spec §5). The app connects as postgres (bypasses RLS);
-- enabling RLS with no policies denies every other role by default.
alter table webinars enable row level security;
alter table sessions enable row level security;
alter table registrants enable row level security;
alter table attendances enable row level security;
