-- Slice 2, migration 0002: seeded chat script (spec §5).

create table chat_scripts (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  offset_seconds int not null,
  display_name text not null,
  role text not null check (role in ('admin','attendee')),
  message text not null,
  mode text not null check (mode in ('chat','question','answer','highlighted','tip')),
  sort_order int,
  created_at timestamptz default now()
);
create index on chat_scripts (webinar_id, offset_seconds);

alter table chat_scripts enable row level security;
