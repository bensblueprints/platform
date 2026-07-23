-- Slice 9, migration 0010: script generator state (spec §7).

create table transcript_cache (
  video_hash text primary key,
  transcript jsonb not null,
  created_at timestamptz default now()
);

create table beat_cache (
  transcript_hash text primary key,
  beats jsonb not null,
  created_at timestamptz default now()
);

alter table name_roster add column if not exists persona jsonb;

alter table chat_scripts add column if not exists source text default 'imported';
alter table chat_scripts add column if not exists status text default 'live';
-- source: imported | generated | reconstructed | hand
-- status: draft (not shown in rooms) | live

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  status text not null default 'queued', -- queued | running | done | failed
  stage text,
  error text,
  usage jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table transcript_cache enable row level security;
alter table beat_cache enable row level security;
alter table generation_jobs enable row level security;
