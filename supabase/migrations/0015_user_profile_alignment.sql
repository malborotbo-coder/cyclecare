-- Align users table with profile requirements (idempotent)
alter table if exists users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists auth_provider text,
  add column if not exists auth_provider_id text,
  add column if not exists profile_image_url text,
  add column if not exists avatar_url text,
  add column if not exists is_technician boolean default false,
  add column if not exists is_admin boolean default false,
  add column if not exists created_at timestamp default now(),
  add column if not exists updated_at timestamp default now();

create index if not exists idx_users_auth_provider_id on users(auth_provider_id);
create index if not exists idx_users_phone on users(phone);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
