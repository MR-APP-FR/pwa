-- Fond de caisse / stand confiserie déjà en `site_infos` (legacy WP) mais
-- non branchés PWA/CRM. On normalise les valeurs + expose confiserie à la
-- fermeture + justification si photo parking impossible.

-- 1) Defaults fond de caisse : 100 € partout sauf SC (200) et CAP3000 (150).
update public.site_infos
set fond_caisse = 100
where fond_caisse is null;

update public.site_infos si
set fond_caisse = 200
from public.site s
where si.site_id = s.id
  and upper(trim(s.name)) = 'SACRE COEUR';

update public.site_infos si
set fond_caisse = 150
from public.site s
where si.site_id = s.id
  and upper(regexp_replace(trim(s.name), '\s+', '', 'g')) in ('CAP3000', 'CAP 3000');

comment on column public.site_infos.fond_caisse is
  'Montant du fond de caisse attendu (€). Affiché à l''ouverture PWA. Défaut 100 ; SC 200 ; CAP3000 150.';

-- 2) Stand confiserie : activer si data a déjà eu de la confiserie (> 0).
update public.site_infos si
set stand_confiserie = true
where exists (
  select 1
  from public.data d
  where d.site_id = si.site_id
    and d.confiserie is not null
    and d.confiserie > 0
);

update public.site_infos
set stand_confiserie = false
where stand_confiserie is null;

comment on column public.site_infos.stand_confiserie is
  'Si true, la PWA demande le CA confiserie à la fermeture (Enghien, Nogent, etc.).';

-- 3) Fermeture : montant confiserie + raison photo parking.
alter table public.closing_form
  add column if not exists confiserie numeric null,
  add column if not exists photo_parking_raison text null;

comment on column public.closing_form.confiserie is
  'CA confiserie du jour (€). Sync → data.confiserie si stand_confiserie.';
comment on column public.closing_form.photo_parking_raison is
  'Justification si la photo carte parking n''a pas pu être prise (sinon photo obligatoire).';

-- 4) Trigger CA : écrire confiserie depuis closing_form (0 si null).
create or replace function public.sync_closing_form_to_data()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  y int;
  m int;
  d int;
begin
  y := extract(year from new.date)::int;
  m := extract(month from new.date)::int;
  d := extract(day from new.date)::int;

  insert into public.data (site_id, year, month, day, total, cb, confiserie, enfants)
  values (
    new.site_id, y, m, d,
    round(coalesce(new.recette_totale, 0))::int,
    round(coalesce(new.carte_bleue, 0))::int,
    round(coalesce(new.confiserie, 0))::int,
    coalesce(new.nb_enfants, 0)::int
  )
  on conflict (year, month, day, site_id)
  do update set
    total = excluded.total,
    cb = excluded.cb,
    confiserie = excluded.confiserie,
    enfants = excluded.enfants
  where public.data.manual_override = false;

  return new;
end;
$function$;
