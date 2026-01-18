-- Add user profile columns (idempotent)
alter table if exists users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists profile_image_url text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamp default now();

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
