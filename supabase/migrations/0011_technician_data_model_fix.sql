-- Technician data model fixes (idempotent)

-- 1) Ensure technician status/availability columns exist (no breaking changes)
alter table if exists technicians
  add column if not exists status text default 'pending',
  add column if not exists is_active boolean default false,
  add column if not exists is_available boolean default false,
  add column if not exists is_approved boolean default false;

-- 2) Backfill legacy status values (online/offline) into is_available
update technicians
set is_available = true
where status = 'online';

update technicians
set is_available = false
where status = 'offline';

update technicians
set status = 'approved'
where status in ('online', 'offline');

-- 3) Normalize null flags to safe defaults
update technicians
set is_active = false
where is_active is null;

update technicians
set is_available = false
where is_available is null;

-- 4) Backfill technician phone/location from existing user data where missing
update technicians t
set phone_number = u.phone
from users u
where t.user_id = u.id
  and t.phone_number is null
  and u.phone is not null;

update technicians
set location = coalesce(location, location_text, national_address)
where location is null
  and (location_text is not null or national_address is not null);

-- 5) Indexes to stabilize technician lookup and filtering
create index if not exists technicians_status_active_available_idx
  on technicians(status, is_active, is_available);

create index if not exists service_requests_technician_id_idx
  on service_requests(technician_id);

create index if not exists service_requests_technician_created_idx
  on service_requests(technician_id, created_at desc);

-- 6) Safe foreign keys (no breaking change for existing rows)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_requests_technician_fk'
  ) then
    alter table service_requests
      add constraint service_requests_technician_fk
      foreign key (technician_id)
      references technicians(id)
      on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'technician_locations_technician_fk'
  ) then
    alter table technician_locations
      add constraint technician_locations_technician_fk
      foreign key (technician_id)
      references technicians(id)
      on delete cascade
      not valid;
  end if;
end $$;

-- 7) Unified technician profile view (users = identity, technicians = profession)
create or replace view technician_profiles_view as
select
  t.id as technician_id,
  t.user_id,
  u.email,
  u.phone as user_phone,
  u.first_name,
  u.last_name,
  concat_ws(' ', u.first_name, u.last_name) as full_name,
  t.phone_number,
  t.years_of_experience,
  t.status,
  t.is_active,
  t.is_available,
  t.rating,
  t.review_count,
  t.location,
  t.latitude,
  t.longitude,
  t.created_at,
  t.updated_at
from technicians t
left join users u on u.id = t.user_id;

-- 8) Live technicians view for admin map (online = approved + active + available)
create or replace view live_technicians_view as
select
  t.id as technician_id,
  t.user_id,
  u.email,
  u.phone as user_phone,
  u.first_name,
  u.last_name,
  concat_ws(' ', u.first_name, u.last_name) as full_name,
  t.phone_number,
  t.years_of_experience,
  t.status,
  t.is_active,
  t.is_available,
  t.rating,
  t.review_count,
  coalesce(l.latitude, t.latitude) as latitude,
  coalesce(l.longitude, t.longitude) as longitude,
  l.last_updated
from technicians t
left join users u on u.id = t.user_id
left join technician_locations l on l.technician_id = t.id
where t.status = 'approved'
  and t.is_active = true
  and t.is_available = true
  and coalesce(l.latitude, t.latitude) is not null
  and coalesce(l.longitude, t.longitude) is not null;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
