-- Backfill old service requests to real technician (Ahmed) - safe, idempotent

with target_tech as (
  select technician_id
  from technician_profiles_view
  where lower(coalesce(full_name, '')) like '%ahmed%'
     or lower(coalesce(email, '')) like '%ahmed%'
  order by created_at asc
  limit 1
)
update service_requests sr
set technician_id = (select technician_id from target_tech)
where (sr.technician_id is null or sr.technician_id like 'mock-%')
  and sr.status in ('pending','created','assigned')
  and (select technician_id from target_tech) is not null;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
