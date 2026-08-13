alter table public.availability
  add column dispo_derniere_minute boolean,
  add column dispo_derniere_minute_at timestamptz;
