-- Add role + app metadata to push_tokens (idempotent)
alter table push_tokens
  add column if not exists role text;

alter table push_tokens
  add column if not exists app_version text;

alter table push_tokens
  add column if not exists environment text;

create index if not exists push_tokens_device_id_idx on push_tokens(device_id);
create index if not exists push_tokens_role_idx on push_tokens(role);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
