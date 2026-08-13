-- Baseline comparable d'un (site, jour) : 4 mêmes jours de semaine précédents
-- + même date calendaire N-1 et N-2. Source unique PWA (passage) et CRM (tendance CA).

create table public.site_day_baseline (
  site_id integer not null references public.site(id) on delete cascade,
  date date not null,
  avg4_enfants numeric(10, 1),
  avg4_ca numeric(12, 1),
  avg4_n integer not null default 0,
  ly_enfants numeric(10, 1),
  ly_ca numeric(12, 1),
  y2_enfants numeric(10, 1),
  y2_ca numeric(12, 1),
  expected_enfants numeric(10, 1),
  expected_ca numeric(12, 1),
  sample_count integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (site_id, date)
);

comment on table public.site_day_baseline is
  'Précalcul CA/enfants comparables : J-7/14/21/28 + même jour année-1 et année-2.';

create index site_day_baseline_date_idx on public.site_day_baseline (date);

alter table public.site_day_baseline enable row level security;

create policy "site_day_baseline admin all" on public.site_day_baseline
  for all using (is_admin()) with check (is_admin());

create policy "site_day_baseline authenticated select" on public.site_day_baseline
  for select to authenticated using (true);
