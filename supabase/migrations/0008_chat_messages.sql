-- Slice 7, migration 0008: real chat messages (spec §5, §6.1).

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  registrant_id uuid references registrants(id) on delete cascade,
  author_type text not null check (author_type in ('attendee','moderator')),
  body text not null,
  broadcast boolean default false,
  created_at timestamptz default now()
);
create index on chat_messages (session_id, created_at);
create index on chat_messages (registrant_id, created_at);

alter table chat_messages enable row level security;

-- For the spec's Supabase Realtime transport; harmless while the SSE
-- transport carries chat (Kong on this box redirects all API routes).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table chat_messages;
  end if;
exception when duplicate_object then
  null;
end $$;
