-- Idempotent creation of technician_locations to support nearby technicians and live GPS
CREATE TABLE IF NOT EXISTS public.technician_locations (
  technician_id varchar NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  latitude decimal(10,8) NOT NULL,
  longitude decimal(11,8) NOT NULL,
  last_updated timestamp DEFAULT now(),
  CONSTRAINT technician_locations_pkey PRIMARY KEY (technician_id)
);

CREATE INDEX IF NOT EXISTS technician_locations_updated_idx ON public.technician_locations(last_updated DESC);
