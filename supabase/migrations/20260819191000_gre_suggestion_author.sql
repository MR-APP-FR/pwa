-- Boîte à idées : on enregistre toujours l'auteur (current_employee_id),
-- même si l'employé a coché l'anonymat. Le CRM affiche le nom + un
-- indicateur « Message anonyme ». L'écriture reste hors messagerie staff.

alter table public.suggestion_anonyme
  add column if not exists user_id integer references public.user (id) on delete set null,
  add column if not exists is_anonymous boolean not null default false;

comment on column public.suggestion_anonyme.user_id is
  'Auteur réel, toujours renseigné à l''envoi. Conservé même si is_anonymous.';
comment on column public.suggestion_anonyme.is_anonymous is
  'Si true, le CRM affiche le nom avec l''indicateur Message anonyme.';

-- Plus d'insert direct : seul le RPC SECURITY DEFINER pose user_id.
drop policy if exists "suggestion_anonyme insert authenticated" on public.suggestion_anonyme;

drop function if exists public.submit_suggestion_anonyme(text, text);

create function public.submit_suggestion_anonyme(
  corps text,
  categorie text default null,
  is_anonymous boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  emp_id integer;
  cat text;
begin
  emp_id := current_employee_id();
  if emp_id is null then
    raise exception 'Compte non lié à un employé';
  end if;

  if corps is null or btrim(corps) = '' then
    raise exception 'Message vide';
  end if;

  cat := nullif(btrim(categorie), '');
  if cat is not null and cat not in ('materiel', 'organisation', 'ambiance', 'autres') then
    raise exception 'Catégorie invalide';
  end if;

  insert into public.suggestion_anonyme (corps, categorie, user_id, is_anonymous)
  values (btrim(corps), cat, emp_id, coalesce(is_anonymous, false));
end;
$$;

revoke all on function public.submit_suggestion_anonyme(text, text, boolean) from public, anon;
grant execute on function public.submit_suggestion_anonyme(text, text, boolean) to authenticated;
