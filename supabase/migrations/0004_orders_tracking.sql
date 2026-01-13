-- Add tracking + delivery option for shop orders (safe, idempotent)
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS delivery_option text,
  ADD COLUMN IF NOT EXISTS tracking_steps jsonb DEFAULT '[]'::jsonb;

-- Refresh PostgREST schema cache
select pg_notify('pgrst','reload schema');
