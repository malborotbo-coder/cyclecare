-- SAFE / IDEMPOTENT PATCH FOR BOOKING FLOW FOUNDATION
-- Uses IF NOT EXISTS and guards to avoid destructive changes.
-- Apply in psql or Supabase SQL editor.

-- 1) Technicians: status (online/offline) to gate live location + availability
ALTER TABLE IF EXISTS public.technicians
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'offline';

-- 2) Technician live location table
CREATE TABLE IF NOT EXISTS public.technician_locations (
  technician_id varchar NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  latitude decimal(10,8) NOT NULL,
  longitude decimal(11,8) NOT NULL,
  last_updated timestamp DEFAULT now(),
  CONSTRAINT technician_locations_pkey PRIMARY KEY (technician_id)
);
CREATE INDEX IF NOT EXISTS technician_locations_updated_idx ON public.technician_locations(last_updated DESC);

-- 3) Services catalog (basic)
CREATE TABLE IF NOT EXISTS public.services (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  name_en varchar,
  base_price decimal(10,2),
  description text,
  created_at timestamp DEFAULT now()
);

-- 4) Service requests: pricing + distance metadata
ALTER TABLE IF EXISTS public.service_requests
  ADD COLUMN IF NOT EXISTS distance_km decimal(10,2),
  ADD COLUMN IF NOT EXISTS price_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS breakdown_version varchar;

-- 5) Orders: link to service request + commission/payout fields + breakdown JSON
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS service_request_id varchar REFERENCES public.service_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS technician_id varchar REFERENCES public.technicians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_rate decimal(5,2),
  ADD COLUMN IF NOT EXISTS app_commission_amount decimal(10,2),
  ADD COLUMN IF NOT EXISTS technician_net_amount decimal(10,2),
  ADD COLUMN IF NOT EXISTS breakdown_json jsonb;

-- 6) Order items table (idempotent)
CREATE TABLE IF NOT EXISTS public.order_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price decimal(10,2) NOT NULL,
  total decimal(10,2) NOT NULL,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);

-- 7) Invoices: PDF URL + metadata
ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 8) Payments: allow mock payment tagging
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS is_mock boolean DEFAULT false;

-- 9) Technician statement helper table (optional summary, safe create)
CREATE TABLE IF NOT EXISTS public.technician_payouts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id varchar NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  order_id varchar NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  commission_rate decimal(5,2) NOT NULL,
  app_commission_amount decimal(10,2) NOT NULL,
  technician_net_amount decimal(10,2) NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS technician_payouts_tech_idx ON public.technician_payouts(technician_id);
