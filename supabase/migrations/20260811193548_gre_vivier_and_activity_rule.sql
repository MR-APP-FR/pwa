alter table public.user_info
  add column vivier_statut text not null default 'actif' check (vivier_statut in ('actif','vivier','archive')),
  add column vivier_priorite int,
  add column vivier_note text;

-- Backfill : les fiches déjà liées à un user actuellement inactif basculent en vivier.
update public.user_info ui
set vivier_statut = 'vivier'
from public.user u
where u.id = ui.user_id and u.actif is false;

-- Règle de désactivation automatique, configurable et rejouable par l'admin (singleton).
create table public.staff_activity_rule (
  id boolean primary key default true check (id),
  cutoff_year int not null default 2026,
  cutoff_month int not null default 1 check (cutoff_month between 1 and 12),
  grace_months int not null default 6,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.staff_activity_rule (id) values (true);

alter table public.staff_activity_rule enable row level security;

create policy "staff_activity_rule admin all" on public.staff_activity_rule
  for all using (is_admin()) with check (is_admin());

-- Recalcule public.user.actif : actif si présent au planning depuis (cutoff_year, cutoff_month)
-- OU si créé il y a moins de grace_months (nouvel embauché protégé le temps d'avoir du planning).
-- Sans paramètre, réutilise/rejoue la dernière règle enregistrée. Avec paramètres, met à jour la règle puis l'applique.
create or replace function public.recompute_staff_activity(
  p_cutoff_year int default null,
  p_cutoff_month int default null,
  p_grace_months int default null
)
returns table(user_id int, actif boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cutoff_year int;
  v_cutoff_month int;
  v_grace_months int;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  select coalesce(p_cutoff_year, r.cutoff_year),
         coalesce(p_cutoff_month, r.cutoff_month),
         coalesce(p_grace_months, r.grace_months)
    into v_cutoff_year, v_cutoff_month, v_grace_months
  from public.staff_activity_rule r
  where r.id = true;

  update public.staff_activity_rule
  set cutoff_year = v_cutoff_year,
      cutoff_month = v_cutoff_month,
      grace_months = v_grace_months,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;

  return query
  with recent_planning as (
    select p.user_id as uid from public.planning p
    where p.user_id is not null
      and (p.year > v_cutoff_year or (p.year = v_cutoff_year and p.month >= v_cutoff_month))
    union
    select p.double_id as uid from public.planning p
    where p.double_id is not null
      and (p.year > v_cutoff_year or (p.year = v_cutoff_year and p.month >= v_cutoff_month))
  ),
  computed as (
    select u.id,
      (u.id in (select uid from recent_planning)
       or u.registered >= (now() - (v_grace_months || ' months')::interval)) as new_actif
    from public.user u
  )
  update public.user u
  set actif = c.new_actif
  from computed c
  where u.id = c.id and u.actif is distinct from c.new_actif
  returning u.id, u.actif;
end;
$$;

grant execute on function public.recompute_staff_activity(int, int, int) to authenticated;
