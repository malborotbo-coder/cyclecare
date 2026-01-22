-- Notification engine extensions (idempotent)
alter table if exists notifications
  add column if not exists role text,
  add column if not exists state text default 'created',
  add column if not exists activity_type text,
  add column if not exists activity_id text,
  add column if not exists activity_state text,
  add column if not exists live_activity_payload jsonb;

update notifications
set state = 'created'
where state is null;

-- Device metadata for push registration
alter table if exists push_tokens
  add column if not exists app_version text,
  add column if not exists environment text;

-- Delivery attempt log
create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  token text,
  platform text,
  status text,
  response jsonb,
  created_at timestamp default now()
);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
