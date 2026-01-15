-- Service request workflow enhancements (idempotent)

-- 1) Add workflow timestamps + completion image
alter table if exists service_requests
  add column if not exists accepted_at timestamp,
  add column if not exists rejected_at timestamp,
  add column if not exists completed_at timestamp,
  add column if not exists completed_image_url text;

-- 2) Technician reviews table
create table if not exists technician_reviews (
  id uuid primary key default gen_random_uuid(),
  technician_id text not null references technicians(id) on delete cascade,
  order_id text not null references service_requests(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  rating integer not null,
  comment text,
  created_at timestamp default now(),
  constraint technician_reviews_rating_check check (rating >= 1 and rating <= 5),
  constraint technician_reviews_unique unique (order_id, user_id)
);

create index if not exists technician_reviews_technician_idx
  on technician_reviews(technician_id);

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
