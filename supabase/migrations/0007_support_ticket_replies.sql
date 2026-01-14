-- Support ticket replies for threaded conversations (idempotent)
create table if not exists support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid,
  sender_role text not null default 'user',
  message text not null,
  created_at timestamp default now()
);

create index if not exists support_ticket_replies_ticket_idx
  on support_ticket_replies (ticket_id);
create index if not exists support_ticket_replies_created_at_idx
  on support_ticket_replies (created_at asc);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
