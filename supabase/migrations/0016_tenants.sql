-- Multi-tenant: customers run their own webinars (BYOK), billed via WHOP.
-- Scope is app-level: every tenant's data hangs off webinars.tenant_id.

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text,
  plan text not null default 'free' check (plan in ('free','lifetime','monthly')),
  status text not null default 'active' check (status in ('active','past_due','cancelled')),
  whop_membership_id text unique,
  whop_email text,
  created_at timestamptz default now()
);

alter table users add column if not exists tenant_id uuid references tenants(id);
alter table users add column if not exists role text not null default 'owner' check (role in ('platform','owner'));

create table if not exists tenant_settings (
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  primary key (tenant_id, key)
);

-- backfill: the existing owner becomes the platform tenant and keeps everything
with t as (
  insert into tenants (name, plan, status)
  select 'Advanced Marketing', 'lifetime', 'active'
  where not exists (select 1 from tenants)
  returning id
)
update users set tenant_id = (select id from t), role = 'platform'
from t
where users.tenant_id is null;

update webinars w set tenant_id = u.tenant_id
from users u
where u.role = 'platform' and w.tenant_id is null;
