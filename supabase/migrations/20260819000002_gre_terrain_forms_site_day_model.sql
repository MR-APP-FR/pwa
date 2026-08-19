-- Audit 2026-08-18 (§3.1, §3.2, Lot 1) : modèle "une ligne par site et par jour"
-- pour opening_form / closing_form / daily_info.
--
-- 1) Supprime la contrainte unique (site_id,date,user_id) concurrente sur
--    opening_form / closing_form — l'app upsert sur (site_id,date), la
--    contrainte perdante faisait échouer le second teneur d'un binôme.
-- 2) Élargit SELECT/UPDATE de opening_form et daily_info au binôme planifié
--    (planning.user_id / double_id), sur le modèle déjà en place pour
--    closing_form (partner_user_id) — daily_info n'avait même pas de policy
--    UPDATE employé.
-- 3) Réécrit create_intervention_from_panne en AFTER INSERT OR UPDATE avec
--    déduplication (daily_info_id, sujet) : le passage de daily_info en
--    upsert aurait sinon fait disparaître la création d'interventions sur
--    toute correction.

-- 1) Contraintes
alter table public.opening_form drop constraint if exists opening_form_site_date_user_unique;
alter table public.closing_form drop constraint if exists closing_form_site_date_user_unique;

-- 2) RLS opening_form
drop policy if exists "opening_form select admin_or_own" on public.opening_form;
create policy "opening_form select admin_or_own"
on public.opening_form
for select
to authenticated
using (
  (select is_admin())
  or user_id = (select current_employee_id())
  or exists (
    select 1 from public.planning p
    where p.site_id = opening_form.site_id
      and make_date(p.year, p.month, p.day) = opening_form.date
      and (p.user_id = (select current_employee_id()) or p.double_id = (select current_employee_id()))
  )
);

drop policy if exists "opening_form employee update own" on public.opening_form;
create policy "opening_form employee update own"
on public.opening_form
for update
to authenticated
using (
  user_id = (select current_employee_id())
  or exists (
    select 1 from public.planning p
    where p.site_id = opening_form.site_id
      and make_date(p.year, p.month, p.day) = opening_form.date
      and (p.user_id = (select current_employee_id()) or p.double_id = (select current_employee_id()))
  )
)
with check (user_id = (select current_employee_id()));

-- 2) RLS daily_info (SELECT élargie + UPDATE employé manquante)
drop policy if exists "daily_info select admin_or_own" on public.daily_info;
create policy "daily_info select admin_or_own"
on public.daily_info
for select
to authenticated
using (
  (select is_admin())
  or user_id = (select current_employee_id())
  or exists (
    select 1 from public.planning p
    where p.site_id = daily_info.site_id
      and make_date(p.year, p.month, p.day) = daily_info.date
      and (p.user_id = (select current_employee_id()) or p.double_id = (select current_employee_id()))
  )
);

drop policy if exists "daily_info employee update own" on public.daily_info;
create policy "daily_info employee update own"
on public.daily_info
for update
to authenticated
using (
  user_id = (select current_employee_id())
  or exists (
    select 1 from public.planning p
    where p.site_id = daily_info.site_id
      and make_date(p.year, p.month, p.day) = daily_info.date
      and (p.user_id = (select current_employee_id()) or p.double_id = (select current_employee_id()))
  )
)
with check (user_id = (select current_employee_id()));

-- 3) Trigger : AFTER INSERT OR UPDATE + déduplication par (daily_info_id, sujet)
create or replace function public.create_intervention_from_panne()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  panne_text text;
  has_sujets boolean;
  has_autre boolean;
  sid integer;
  sujet_name text;
  ticket_text text;
  line text;
  reason text;
  existing_id bigint;
  existing_description text;
begin
  panne_text := lower(trim(coalesce(new.pannes, '')));
  has_sujets := coalesce(cardinality(new.pannes_sujet_ids), 0) > 0;
  has_autre := trim(coalesce(new.pannes_autre, '')) <> '';

  if has_sujets then
    for sid in
      select distinct x
      from unnest(new.pannes_sujet_ids) as x
      where x is not null
    loop
      select s.name into sujet_name
      from public.sujets s
      where s.id = sid and s.site_id = new.site_id;

      ticket_text := coalesce(nullif(trim(sujet_name), ''), 'Sujet #' || sid::text);
      reason := null;

      if new.pannes is not null and sujet_name is not null then
        foreach line in array string_to_array(new.pannes, e'\n') loop
          line := trim(line);
          if line is null or line = '' or line = sujet_name then
            continue;
          elsif left(line, char_length(sujet_name) + 1) = sujet_name || ':' then
            reason := nullif(trim(substr(line, char_length(sujet_name) + 2)), '');
          elsif left(line, char_length(sujet_name) + 2) = sujet_name || ' :' then
            reason := nullif(trim(substr(line, char_length(sujet_name) + 3)), '');
          end if;
        end loop;
      end if;

      if reason is not null then
        ticket_text := reason;
      end if;

      select i.id, i.description into existing_id, existing_description
      from public.intervention i
      where i.daily_info_id = new.id
        and i.sujet_ids = array[sid]::integer[]
      limit 1;

      if existing_id is null then
        insert into public.intervention (
          site_id, daily_info_id, reported_by, reported_at,
          description, sujet_ids, pannes_autre, urgent, status
        ) values (
          new.site_id, new.id, new.user_id, coalesce(new.submitted_at, now()),
          ticket_text, array[sid]::integer[], ticket_text, false, 'signalee'
        );
      elsif existing_description is distinct from ticket_text then
        update public.intervention
        set description = ticket_text, pannes_autre = ticket_text
        where id = existing_id;
      end if;
    end loop;
  end if;

  if has_autre then
    ticket_text := trim(new.pannes_autre);

    select i.id, i.description into existing_id, existing_description
    from public.intervention i
    where i.daily_info_id = new.id
      and i.sujet_ids = '{}'::integer[]
    limit 1;

    if existing_id is null then
      insert into public.intervention (
        site_id, daily_info_id, reported_by, reported_at,
        description, sujet_ids, pannes_autre, urgent, status
      ) values (
        new.site_id, new.id, new.user_id, coalesce(new.submitted_at, now()),
        ticket_text, '{}'::integer[], ticket_text, false, 'signalee'
      );
    elsif existing_description is distinct from ticket_text then
      update public.intervention
      set description = ticket_text, pannes_autre = ticket_text
      where id = existing_id;
    end if;
  end if;

  if not has_sujets and not has_autre then
    if panne_text = '' or panne_text in ('pas de panne', 'rien', 'ras', 'aucune') then
      return new;
    end if;

    ticket_text := trim(new.pannes);

    select i.id, i.description into existing_id, existing_description
    from public.intervention i
    where i.daily_info_id = new.id
      and i.sujet_ids = '{}'::integer[]
    limit 1;

    if existing_id is null then
      insert into public.intervention (
        site_id, daily_info_id, reported_by, reported_at,
        description, sujet_ids, pannes_autre, urgent, status
      ) values (
        new.site_id, new.id, new.user_id, coalesce(new.submitted_at, now()),
        ticket_text, '{}'::integer[], ticket_text, false, 'signalee'
      );
    elsif existing_description is distinct from ticket_text then
      update public.intervention
      set description = ticket_text, pannes_autre = ticket_text
      where id = existing_id;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists create_intervention_from_panne on public.daily_info;
create trigger create_intervention_from_panne
after insert or update of pannes, pannes_sujet_ids, pannes_autre on public.daily_info
for each row execute function public.create_intervention_from_panne();
