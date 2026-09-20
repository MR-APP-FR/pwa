-- Perf CRM P2 : initplan RLS + policies SELECT admin redondantes + indexes planning dupliqués.

-- ---------------------------------------------------------------------------
-- user_roles : auth.uid() → (select auth.uid())
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- stats : is_admin() InitPlan + drop SELECT redondant (ALL couvre déjà SELECT)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can read stats" ON public.stats;
DROP POLICY IF EXISTS "Admins can write stats" ON public.stats;

CREATE POLICY "Admins can write stats" ON public.stats
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- data / site_day_baseline : SELECT admin redondant avec policy ALL
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "data admin select" ON public.data;
DROP POLICY IF EXISTS "site_day_baseline admin select" ON public.site_day_baseline;

-- ---------------------------------------------------------------------------
-- Hot-path admin policies : wrapper (select is_admin())
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow admin to do everything on data" ON public.data;
CREATE POLICY "Allow admin to do everything on data" ON public.data
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Allow admin to do everything on sites" ON public.site;
CREATE POLICY "Allow admin to do everything on sites" ON public.site
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Allow admin to do everything on user" ON public."user";
CREATE POLICY "Allow admin to do everything on user" ON public."user"
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "site_day_baseline admin all" ON public.site_day_baseline;
CREATE POLICY "site_day_baseline admin all" ON public.site_day_baseline
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "site_infos admin write" ON public.site_infos;
CREATE POLICY "site_infos admin write" ON public.site_infos
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "site_weather admin all" ON public.site_weather;
CREATE POLICY "site_weather admin all" ON public.site_weather
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- Indexes planning dupliqués (advisor duplicate_index)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_planning_site_id;
DROP INDEX IF EXISTS public.idx_planning_date;
