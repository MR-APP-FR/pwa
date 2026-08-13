create function public.staff_category_from_score(score int)
returns text
language sql
immutable
as $$
  select case
    when score >= 3 then 'super'
    when score = 2 then 'bon'
    when score between 0 and 1 then 'normal'
    when score between -2 and -1 then 'bof'
    else 'separer'
  end;
$$;

create table public.staff_month_score (
  id bigint generated always as identity primary key,
  user_id integer not null references public.user(id),
  year int not null,
  month int not null check (month between 1 and 12),
  pts_ca int not null default 0,
  pts_ponctualite int not null default 0,
  pts_nettoyage int not null default 0,
  pts_avis int not null default 0,
  pts_total int generated always as (pts_ca + pts_ponctualite + pts_nettoyage + pts_avis) stored,
  category text check (category in ('super','bon','normal','bof','separer')),
  category_override text check (category_override in ('super','bon','normal','bof','separer')),
  override_reason text,
  override_by uuid references auth.users(id),
  override_at timestamptz,
  computed_at timestamptz,
  locked boolean not null default false,
  unique (user_id, year, month)
);

alter table public.staff_month_score enable row level security;

create policy "staff_month_score admin all" on public.staff_month_score
  for all using (is_admin()) with check (is_admin());
