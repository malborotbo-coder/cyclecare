-- Support tickets table for admin review
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  user_name text,
  type text not null,
  category text not null,
  message text not null,
  screenshot_url text,
  status text not null default 'open',
  created_at timestamp default now()
);

create index if not exists support_tickets_created_at_idx on support_tickets (created_at desc);
create index if not exists support_tickets_user_id_idx on support_tickets (user_id);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
