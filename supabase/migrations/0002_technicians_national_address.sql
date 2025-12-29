-- Ensure technicians columns exist and PostgREST sees them
alter table if exists technicians
  add column if not exists status text default 'pending',
  add column if not exists is_active boolean default false,
  add column if not exists is_available boolean default false,
  add column if not exists national_address text;

-- Trigger PostgREST schema cache reload
select pg_notify('pgrst','reload schema');
