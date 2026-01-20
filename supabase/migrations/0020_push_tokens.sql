-- Push tokens for device notifications (idempotent)
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  token_type text not null,
  platform text,
  device_id text,
  last_seen_at timestamp default now(),
  created_at timestamp default now(),
  updated_at timestamp default now(),
  is_active boolean default true
);

create unique index if not exists push_tokens_user_token_type_idx
  on push_tokens(user_id, token, token_type);
create index if not exists push_tokens_user_id_idx on push_tokens(user_id);
create index if not exists push_tokens_token_idx on push_tokens(token);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
