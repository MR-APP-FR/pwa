-- planning avait deux policies SELECT permissives (admin ALL + employé own/double).
-- Postgres les OR-e et les évalue toutes les deux par ligne. Sans wrapper
-- (SELECT fn()), current_employee_id() (JOIN auth.users) et is_admin() — dont
-- l'argument par défaut auth.uid() inline current_setting() — restent dans le
-- Filter par ligne au lieu d'un InitPlan. Mesure sous authenticated admin :
-- LIMIT 1000 OFFSET 5000 ≈ 8.8s, tué par statement_timeout=8s (57014).
-- C'est le timeout de getStaffPerformance() et la cause du COUNT exact opaque.
--
-- Une seule policy SELECT + (SELECT fn()) (reco Supabase RLS). Writes admin
-- en policies séparées pour ne pas recréer un double SELECT.

DROP POLICY IF EXISTS "Allow admin to do everything on planning" ON public.planning;
DROP POLICY IF EXISTS "planning employee select own_or_double" ON public.planning;

CREATE POLICY "planning select admin_or_own" ON public.planning
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
    OR double_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "planning admin insert" ON public.planning
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "planning admin update" ON public.planning
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "planning admin delete" ON public.planning
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));
