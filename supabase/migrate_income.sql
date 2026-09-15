-- Run once in the Supabase SQL editor after the original schema.
-- Personal salary/account/FD amounts stay in the database, not in git.

create table if not exists accounts (
  id text primary key,
  name text not null,
  balance numeric not null default 0,
  updated_at timestamptz default now()
);

create table if not exists income (
  id text primary key,
  date date not null,
  amount numeric not null,
  pf numeric not null default 0,
  tax numeric not null default 0,
  ssip numeric not null default 0,
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists fds (
  id text primary key,
  bank text not null,
  invested numeric not null default 0,
  principal numeric not null default 0,
  roi numeric not null default 0,
  years numeric not null default 0,
  maturity_date date,
  auto_renew boolean not null default false,
  maturity_amount numeric not null default 0
);

alter table accounts enable row level security;
alter table income enable row level security;
alter table fds enable row level security;

grant all on table accounts to service_role;
grant all on table income to service_role;
grant all on table fds to service_role;

alter table income add column if not exists tax numeric not null default 0;
alter table income add column if not exists ssip numeric not null default 0;
