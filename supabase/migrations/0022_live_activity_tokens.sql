-- Live Activity tokens for iOS (idempotent)
create table if not exists live_activity_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_requests(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  order_number text,
  token text not null,
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists live_activity_tokens_order_id_idx on live_activity_tokens(order_id);
create index if not exists live_activity_tokens_user_id_idx on live_activity_tokens(user_id);
create unique index if not exists live_activity_tokens_order_token_idx on live_activity_tokens(order_id, token);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
