-- Slice 10, migration 0011: platform owner auth (rolled — Supabase Auth is
-- unreachable behind this box's broken Kong gateway).

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table auth_sessions (
  token_hash text primary key,
  user_id uuid references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index on auth_sessions (user_id);

alter table users enable row level security;
alter table auth_sessions enable row level security;
