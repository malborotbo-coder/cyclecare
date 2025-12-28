-- Idempotent migration to align schema with PostgREST expectations

-- parts required columns
alter table if exists parts
  add column if not exists image_url text,
  add column if not exists is_active boolean default true,
  add column if not exists in_stock boolean default true,
  add column if not exists name_en text,
  add column if not exists description text,
  add column if not exists stock_qty integer,
  add column if not exists price numeric,
  add column if not exists category text,
  add column if not exists created_at timestamp default now(),
  add column if not exists updated_at timestamp default now();

-- technicians required columns
alter table if exists technicians
  add column if not exists status text default 'pending',
  add column if not exists is_active boolean default false,
  add column if not exists is_available boolean default true,
  add column if not exists rating numeric(3,2) default 0.00,
  add column if not exists review_count integer default 0,
  add column if not exists latitude numeric(10,8),
  add column if not exists longitude numeric(11,8),
  add column if not exists years_of_experience integer,
  add column if not exists location_text text,
  add column if not exists created_at timestamp default now(),
  add column if not exists updated_at timestamp default now();

-- technician_documents required columns
alter table if exists technician_documents
  add column if not exists mime_type text,
  add column if not exists file_size integer;

-- roles table
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text,
  permissions jsonb not null default '[]',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- user_roles table
create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  assigned_by uuid references users(id),
  assigned_at timestamp default now(),
  constraint user_role_unique unique (user_id, role_id)
);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
