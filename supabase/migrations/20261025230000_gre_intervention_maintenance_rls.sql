-- Mode tech maintenance PWA : lecture de tous les tickets + update (planif / clôture).
-- Rôle métier = public.user.role = 'maintenance' (fiche staff CRM).

CREATE OR REPLACE FUNCTION public.is_maintenance_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."user" AS u
    WHERE u.id = (SELECT public.current_employee_id())
      AND u.role = 'maintenance'
      AND u.actif IS TRUE
  );
$$;

COMMENT ON FUNCTION public.is_maintenance_employee() IS
  'True si public.user.role = maintenance pour current_employee_id().';

REVOKE ALL ON FUNCTION public.is_maintenance_employee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_maintenance_employee() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_maintenance_employee() TO authenticated;

DROP POLICY IF EXISTS "intervention select admin_or_own" ON public.intervention;
CREATE POLICY "intervention select admin_or_own" ON public.intervention
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR reported_by = (SELECT public.current_employee_id())
    OR assignee_user_id = (SELECT public.current_employee_id())
    OR (SELECT public.is_maintenance_employee())
  );

DROP POLICY IF EXISTS "intervention update assignee_or_maintenance" ON public.intervention;
CREATE POLICY "intervention update assignee_or_maintenance" ON public.intervention
  FOR UPDATE TO authenticated
  USING (
    assignee_user_id = (SELECT public.current_employee_id())
    OR (SELECT public.is_maintenance_employee())
  )
  WITH CHECK (
    assignee_user_id = (SELECT public.current_employee_id())
    OR (SELECT public.is_maintenance_employee())
  );
