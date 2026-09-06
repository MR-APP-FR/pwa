-- Pool staff scoring: 5 equal-weight criteria (confiance, CA, chrétienne, On, jours 3m).
-- Rebuild pts_total generated column to include pts_confiance.

alter table public.staff_month_score
  drop column if exists pts_total;

alter table public.staff_month_score
  add column if not exists pts_confiance int not null default 0;

alter table public.staff_month_score
  add column pts_total int generated always as (
    pts_ca + pts_ponctualite + pts_nettoyage + pts_avis + pts_confiance
  ) stored;

create or replace function public.staff_category_from_score(score int)
returns text
language sql
immutable
as $$
  select case
    when score >= 4 then 'super'
    when score = 3 then 'bon'
    when score between 1 and 2 then 'normal'
    when score = 0 then 'bof'
    else 'separer'
  end;
$$;
