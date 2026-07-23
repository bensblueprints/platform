-- Slice 4, migration 0004: simulated attendance curve per webinar (spec §5, §8).

create table attendance_curves (
  webinar_id uuid primary key references webinars(id) on delete cascade,
  peak_count int not null default 240,
  ramp_minutes int not null default 8,
  plateau_pct numeric not null default 0.55,
  end_pct numeric not null default 0.35,
  jitter_pct numeric not null default 0.03
);

alter table attendance_curves enable row level security;
