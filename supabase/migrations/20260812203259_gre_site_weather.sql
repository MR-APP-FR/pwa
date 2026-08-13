-- Météo quotidienne par site (Open-Meteo), pour corrélation CA (CRM)
-- et encouragement staff (PWA). Une ligne = un site × un jour Europe/Paris.

create table public.site_weather (
  id bigint generated always as identity primary key,
  site_id integer not null references public.site(id) on delete cascade,
  date date not null,
  condition text not null check (condition in ('rain', 'normal', 'sun')),
  temp_min numeric(4, 1),
  temp_max numeric(4, 1),
  temp_mean numeric(4, 1),
  precipitation_mm numeric(6, 1),
  sunshine_hours numeric(4, 1),
  weather_code smallint,
  source text not null check (source in ('forecast', 'archive')),
  fetched_at timestamptz not null default now(),
  unique (site_id, date)
);

comment on table public.site_weather is
  'Météo journalière Open-Meteo. Joindre à data via site_id + year/month/day extraits de date.';

create index site_weather_date_idx on public.site_weather (date);

alter table public.site_weather enable row level security;

create policy "site_weather admin all" on public.site_weather
  for all using (is_admin()) with check (is_admin());

create policy "site_weather authenticated select" on public.site_weather
  for select to authenticated using (true);
