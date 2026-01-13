-- Align users/orders columns with API expectations (idempotent)

-- Users table: add phone column if missing
alter table if exists users
  add column if not exists phone text;

-- Orders table: add delivery option + tracking steps if missing
alter table if exists orders
  add column if not exists delivery_option text,
  add column if not exists tracking_steps jsonb default '[]';

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
