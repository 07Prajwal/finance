-- Run in the Supabase SQL editor (once). Service role bypasses RLS; anon has no policies.

create table if not exists expenses (
  id text primary key,
  date date not null,
  time text default '',
  amount numeric not null,
  type text not null,
  category text not null,
  account text not null,
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists holdings (
  id text primary key,
  sleeve text not null check (sleeve in ('indian', 'mf', 'foreign')),
  symbol text not null,
  name text not null,
  price numeric not null default 0,
  change numeric not null default 0,
  change_pct numeric not null default 0,
  shares numeric not null default 0,
  avg numeric not null default 0,
  cost numeric not null default 0,
  currency text,
  platform text default '',
  sort_order int default 0
);

create table if not exists trades (
  id text primary key,
  holding_id text references holdings(id),
  side text not null check (side in ('buy', 'sell')),
  qty numeric not null,
  price numeric not null,
  date date not null,
  cost_inr numeric not null default 0,
  proceeds_inr numeric not null default 0,
  realised numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

alter table expenses enable row level security;
alter table holdings enable row level security;
alter table trades enable row level security;
alter table settings enable row level security;

create table if not exists price_snapshots (
  id text primary key,
  captured_at timestamptz default now(),
  payload jsonb not null
);

alter table price_snapshots enable row level security;

-- No policies on purpose: the public anon key cannot read or write rows.
-- Edge Functions use the service role, which bypasses RLS.
