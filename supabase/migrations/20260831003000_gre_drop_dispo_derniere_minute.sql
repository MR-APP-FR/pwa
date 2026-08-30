alter table public.availability
  drop column if exists dispo_derniere_minute,
  drop column if exists dispo_derniere_minute_at;
