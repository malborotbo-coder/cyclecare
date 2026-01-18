-- Track former technicians (idempotent)
alter table if exists users
  add column if not exists technician_removed_at timestamp;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
