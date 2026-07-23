-- Slice 3, migration 0003: name roster for {{name}} substitution (spec §5, §6.3).

create table name_roster (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  display_name text not null
);

alter table name_roster enable row level security;
