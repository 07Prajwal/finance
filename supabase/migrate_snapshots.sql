-- Run once in the SQL editor (existing projects that already ran schema.sql).

create table if not exists price_snapshots (
  id text primary key,
  captured_at timestamptz default now(),
  payload jsonb not null
);

alter table price_snapshots enable row level security;

-- Required when "Automatically expose new tables" is off.
grant usage on schema public to service_role;
grant all on table expenses to service_role;
grant all on table holdings to service_role;
grant all on table trades to service_role;
grant all on table settings to service_role;
grant all on table price_snapshots to service_role;
