-- Notification logs for admin visibility (idempotent)
create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target text not null,
  sent_by uuid references users(id),
  sent_at timestamp default now(),
  status text not null default 'sent'
);

create index if not exists notification_logs_sent_at_idx on notification_logs(sent_at desc);
create index if not exists notification_logs_sent_by_idx on notification_logs(sent_by);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
