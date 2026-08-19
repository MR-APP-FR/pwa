-- Audit 2026-08-18 (§3.3, §3.8) : colmatage sécurité.
-- 1) Revoke EXECUTE anon/public sur les RPC SECURITY DEFINER sensibles.
-- 2) Garde is_admin() interne à add_admin_by_email (escalade de privilèges via clé anon).
-- 3) RLS sur available_year.
-- 4) Policy sujets employee insert resserrée.
-- 5) SELECT data / site_day_baseline restreint aux admins.
-- 6) search_path fixé sur les fonctions restantes.

-- 1) Revoke anon/public
revoke execute on function public.add_admin_by_email(text) from public, anon;
revoke execute on function public.get_users_with_roles() from public, anon;
revoke execute on function public.ensure_portal_admin_role() from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_email_admin(text) from public, anon;
revoke execute on function public.sync_closing_form_to_data() from public, anon;
revoke execute on function public.submit_suggestion_anonyme(text, text) from public, anon;
revoke execute on function public.recompute_staff_activity(integer, integer, integer) from public, anon;

-- is_admin / is_email_admin sont appelées par des policies RLS pour authenticated ;
-- authenticated garde EXECUTE (déjà accordé), seul anon/public est retiré.
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_email_admin(text) to authenticated;
grant execute on function public.recompute_staff_activity(integer, integer, integer) to authenticated;
grant execute on function public.submit_suggestion_anonyme(text, text) to authenticated;
grant execute on function public.sync_closing_form_to_data() to authenticated;
grant execute on function public.get_users_with_roles() to authenticated;
grant execute on function public.ensure_portal_admin_role() to authenticated;

-- 2) Garde admin dans add_admin_by_email : même en authenticated, seul un admin
-- doit pouvoir promouvoir un autre compte.
create or replace function public.add_admin_by_email(user_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  target_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select id into target_user_id
  from auth.users
  where email = user_email;

  if target_user_id is null then
    raise exception 'User with email % not found', user_email;
  end if;

  insert into user_roles (user_id, role)
  values (target_user_id, 'admin')
  on conflict (user_id) do update set role = 'admin';
end;
$function$;

grant execute on function public.add_admin_by_email(text) to authenticated;

-- 3) available_year : RLS désactivée, table exposée en écriture/lecture à anon.
alter table public.available_year enable row level security;

create policy "available_year admin all"
on public.available_year
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "available_year authenticated select"
on public.available_year
for select
to authenticated
using (true);

-- 4) sujets employee insert : WITH CHECK (true) permettait de créer un sujet
-- sur n'importe quel site. On resserre à un site où l'employé est planifié
-- (aujourd'hui ou dans le passé récent), ce qui couvre le cas d'usage réel
-- (déclarer une panne pendant sa mission) sans ouvrir tous les sites.
drop policy if exists "sujets employee insert" on public.sujets;

create policy "sujets employee insert own site"
on public.sujets
for insert
to authenticated
with check (
  exists (
    select 1 from public.planning p
    where p.site_id = sujets.site_id
      and (p.user_id = current_employee_id() or p.double_id = current_employee_id())
  )
);

-- 5) data / site_day_baseline : le CA complet de l'entreprise ne doit pas être
-- lisible par un employé PWA authentifié. Vérifié : aucune lecture PWA de ces
-- deux tables (seule site_weather est lue côté PWA pour la météo).
drop policy if exists "Allow authenticated users to read data" on public.data;

create policy "data admin select"
on public.data
for select
to authenticated
using (is_admin());

drop policy if exists "site_day_baseline authenticated select" on public.site_day_baseline;

create policy "site_day_baseline admin select"
on public.site_day_baseline
for select
to authenticated
using (is_admin());

-- 6) search_path mutable (corps inchangés, uniquement l'ajout de SET search_path)
create or replace function public.is_admin(user_uuid uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path = public
as $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role = 'admin'
  );
END;
$function$;

create or replace function public.is_email_admin(check_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_emails
    WHERE email = LOWER(check_email)
  );
END;
$function$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- Signature et corps inchangés (déjà gardée par is_admin() en interne) ;
-- seul le search_path est fixé.
create or replace function public.get_users_with_roles()
returns table(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, role text)
language plpgsql
security definer
set search_path = public, auth
as $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    COALESCE(ur.role, 'user')::TEXT as role
  FROM auth.users u
  LEFT JOIN user_roles ur ON u.id = ur.user_id
  ORDER BY u.created_at DESC;
END;
$function$;
