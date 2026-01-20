-- Notifications table for in-app messages (idempotent)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  message text not null,
  emoji text,
  type text,
  entity_type text,
  entity_id text,
  read_at timestamp,
  created_at timestamp default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists notifications_created_at_idx on notifications(created_at desc);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
