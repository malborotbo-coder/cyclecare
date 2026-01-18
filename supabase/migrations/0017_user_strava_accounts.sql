-- Strava accounts linked to users (idempotent)
create table if not exists user_strava_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  athlete_id bigint,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  created_at timestamp default now()
);

create unique index if not exists user_strava_accounts_user_id_key on user_strava_accounts(user_id);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
