-- Slice 8, migration 0009: visitor tracking + notification send records.

create table page_views (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  utm jsonb,
  created_at timestamptz default now()
);
create index on page_views (webinar_id, created_at);

create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  registrant_id uuid references registrants(id) on delete cascade,
  kind text not null,
  channel text not null,
  payload jsonb,
  sent_at timestamptz default now()
);
create index on notifications_log (registrant_id, sent_at);

alter table page_views enable row level security;
alter table notifications_log enable row level security;
