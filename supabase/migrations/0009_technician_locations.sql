-- Technician live locations (idempotent)

create table if not exists technician_locations (
  id uuid primary key default gen_random_uuid(),
  technician_id text not null,
  latitude numeric(10,8) not null,
  longitude numeric(11,8) not null,
  last_updated timestamp default now()
);

create unique index if not exists technician_locations_technician_id_key
  on technician_locations(technician_id);

create index if not exists technician_locations_last_updated_idx
  on technician_locations(last_updated);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
