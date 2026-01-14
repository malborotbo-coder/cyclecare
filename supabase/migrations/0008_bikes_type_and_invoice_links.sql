-- Bikes type + invoice linkage columns (idempotent)
alter table if exists bikes
  add column if not exists bike_type text;

alter table if exists invoices
  add column if not exists order_id text,
  add column if not exists service_request_id text;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
