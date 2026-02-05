-- Push token session guardrails + live activity metadata (idempotent)

alter table if exists live_activity_tokens
  add column if not exists activity_id text;

alter table if exists live_activity_tokens
  add column if not exists environment text;

create index if not exists live_activity_tokens_activity_id_idx
  on live_activity_tokens(activity_id);

create index if not exists live_activity_tokens_order_env_idx
  on live_activity_tokens(order_id, environment);

create unique index if not exists push_tokens_device_active_idx
  on push_tokens(device_id, platform, token_type)
  where is_active = true and device_id is not null and platform is not null and token_type is not null;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
