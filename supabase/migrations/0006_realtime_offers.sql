-- Slice 5 follow-up, migration 0006: stream offers updates over Supabase
-- Realtime (spec §9 price ticks). Guarded so it is a no-op outside Supabase.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table offers;
  end if;
end $$;
