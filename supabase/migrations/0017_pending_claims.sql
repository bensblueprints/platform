-- Pay-first flow: a WHOP purchase made before the account exists is stored
-- and claimed automatically when the buyer signs up with the same email.
create table if not exists pending_plan_claims (
  email text primary key,
  plan text not null check (plan in ('lifetime','monthly')),
  whop_membership_id text,
  created_at timestamptz default now(),
  claimed_at timestamptz
);
