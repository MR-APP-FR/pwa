-- Calendrier FR + passage attendu (moyenne enfants même jour de semaine / mois, années passées).
-- La PWA lit ces colonnes (data.enfants reste admin-only).

alter table public.site_weather drop constraint if exists site_weather_condition_check;
alter table public.site_weather
  add constraint site_weather_condition_check
  check (condition in ('rain', 'normal', 'sun', 'snow'));

alter table public.site_weather
  add column if not exists is_weekend boolean not null default false,
  add column if not exists is_holiday boolean not null default false,
  add column if not exists holiday_name text,
  add column if not exists is_bridge boolean not null default false,
  add column if not exists is_school_holiday boolean not null default false,
  add column if not exists crowd_level text not null default 'typical'
    check (crowd_level in ('busy', 'quiet', 'typical')),
  add column if not exists crowd_enfants_avg numeric(8, 1),
  add column if not exists crowd_sample_count integer;
