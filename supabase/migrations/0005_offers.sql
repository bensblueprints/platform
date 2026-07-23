-- Slice 5, migration 0005: offers + offer events (spec §5, §9).

create table offers (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webinars(id) on delete cascade,
  name text not null,
  headline text not null,
  body text,
  image_url text,
  button_text text not null,
  button_url text,
  stripe_price_id text,
  start_offset_seconds int not null,
  end_offset_seconds int,
  urgency_enabled boolean default false,
  urgency_seconds int,
  scarcity_enabled boolean default false,
  inventory_total int,
  price_start_cents int,
  price_increment_cents int default 0,
  price_cap_cents int,
  units_sold int default 0,
  broadcast_sales boolean default false,
  created_at timestamptz default now()
);

create table offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references offers(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  registrant_id uuid references registrants(id) on delete set null,
  event_type text not null check (event_type in ('impression','click','purchase')),
  offset_seconds int,
  amount_cents int,
  stripe_session_id text unique,
  created_at timestamptz default now()
);
create index on offer_events (offer_id, event_type);

alter table offers enable row level security;
alter table offer_events enable row level security;

-- Offer content is public room data; the anon role needs SELECT for
-- Realtime postgres_changes price ticks (design: slice 5).
create policy offers_public_read on offers for select using (true);
