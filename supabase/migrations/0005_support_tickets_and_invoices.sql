-- Support ticket replies + shop invoice linkage (idempotent)

alter table if exists support_tickets
  add column if not exists reply_message text,
  add column if not exists replied_at timestamp,
  add column if not exists replied_by uuid,
  add column if not exists updated_at timestamp default now();

alter table if exists invoices
  add column if not exists order_id text;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
