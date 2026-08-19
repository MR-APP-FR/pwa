-- L'employé n'a pas de policy UPDATE sur public.user (lecture seule côté PWA).
-- must_change_password doit pouvoir être remis à false par l'employé lui-même
-- après son premier changement de mot de passe, sans lui ouvrir une policy
-- UPDATE générale sur la table. Fonction SECURITY DEFINER dédiée, portée
-- strictement à l'employé résolu par current_employee_id() (comme is_admin()
-- et les autres helpers du même style).
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user
  set must_change_password = false
  where id = current_employee_id();
$$;

revoke all on function public.mark_password_changed() from public;
revoke all on function public.mark_password_changed() from anon;
grant execute on function public.mark_password_changed() to authenticated;
