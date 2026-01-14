-- Discount codes table (idempotent)

create table if not exists discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null,
  discount_value numeric(10,2) not null,
  max_uses integer,
  current_uses integer default 0,
  is_active boolean default true,
  expires_at timestamp,
  created_by uuid references users(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table if exists discount_codes
  add column if not exists code text,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(10,2),
  add column if not exists max_uses integer,
  add column if not exists current_uses integer default 0,
  add column if not exists is_active boolean default true,
  add column if not exists expires_at timestamp,
  add column if not exists created_by uuid references users(id),
  add column if not exists created_at timestamp default now(),
  add column if not exists updated_at timestamp default now();

create unique index if not exists discount_codes_code_key on discount_codes(code);
create index if not exists discount_codes_active_idx on discount_codes(is_active);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
