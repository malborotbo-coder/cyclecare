-- Support ticket number (idempotent)

alter table if exists support_tickets
  add column if not exists ticket_number text;

create unique index if not exists support_tickets_ticket_number_key
  on support_tickets(ticket_number);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
