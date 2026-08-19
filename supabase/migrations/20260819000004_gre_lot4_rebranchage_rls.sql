-- Audit 2026-08-18 §4.2 (Lot 4) : RLS manquantes pour rebrancher des
-- fonctionnalités déjà écrites mais non atteignables.

-- 1) suggestion_anonyme : lecture admin déjà en place, pas de DELETE —
-- l'écran de lecture CRM doit pouvoir purger les suggestions traitées.
create policy "suggestion_anonyme admin delete"
on public.suggestion_anonyme
for delete
to authenticated
using (is_admin());

-- 2) user_info_sites : l'employé doit pouvoir gérer ses propres sites
-- préférés depuis /profil (PWA) — seul l'admin pouvait écrire jusqu'ici.
create policy "user_info_sites employee insert own"
on public.user_info_sites
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_info ui
    where ui.id = user_info_sites.user_info_id
      and ui.user_id = current_employee_id()
  )
);

create policy "user_info_sites employee delete own"
on public.user_info_sites
for delete
to authenticated
using (
  exists (
    select 1 from public.user_info ui
    where ui.id = user_info_sites.user_info_id
      and ui.user_id = current_employee_id()
  )
);
