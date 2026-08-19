-- Audit 2026-08-18 §5 (Lot 5) : `sync_closing_form_to_data` écrasait sans
-- condition toute correction de CA faite à la main dans le CRM dès que la
-- PWA re-soumettait le formulaire de fermeture du même jour. On ajoute un
-- flag `manual_override` posé par l'édition CRM, et le trigger le respecte.
--
-- Cette migration verse aussi dans le contrôle de version le trigger et sa
-- fonction, jusqu'ici uniquement présents en base sans aucun fichier SQL
-- (le maillon le plus critique du flux CA, cf. audit §5 — l'incident
-- documenté dans admin-desktop-app/docs/import-mars-2026-ecarts.md était
-- précisément une rupture silencieuse de ce trigger).

alter table public.data
  add column if not exists manual_override boolean not null default false;

comment on column public.data.manual_override is
  'Posé par une édition manuelle du CA dans le CRM (updateDataRow). Empêche sync_closing_form_to_data d''écraser la correction à la re-soumission du formulaire de fermeture.';

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
    0,
    coalesce(new.nb_enfants, 0)::int
  )
  on conflict (year, month, day, site_id)
  do update set
    total = excluded.total,
    cb = excluded.cb,
    enfants = excluded.enfants
  where public.data.manual_override = false;

  return new;
end;
$function$;
