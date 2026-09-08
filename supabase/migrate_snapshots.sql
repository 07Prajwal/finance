-- Run once in the SQL editor (existing projects that already ran schema.sql).

create table if not exists price_snapshots (
  id text primary key,
  captured_at timestamptz default now(),
  payload jsonb not null
);

alter table price_snapshots enable row level security;
