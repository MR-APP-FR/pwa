-- Employé inactif : peut lire sa propre ligne public.user (profil / todos PWA).
-- Les collègues ne voient toujours que les actifs (planning).

DROP POLICY IF EXISTS "user authenticated select active" ON public."user";
DROP POLICY IF EXISTS "user authenticated select active_or_own" ON public."user";

CREATE POLICY "user authenticated select active_or_own" ON public."user"
  FOR SELECT TO authenticated
  USING (
    actif IS DISTINCT FROM false
    OR id = (SELECT public.current_employee_id())
  );
