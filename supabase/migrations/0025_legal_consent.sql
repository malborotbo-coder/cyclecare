-- Legal consent fields for privacy policy + terms acceptance
alter table if exists users
  add column if not exists accepted_privacy_policy boolean default false,
  add column if not exists accepted_terms boolean default false,
  add column if not exists accepted_legal_at timestamptz,
  add column if not exists accepted_legal_version varchar;
