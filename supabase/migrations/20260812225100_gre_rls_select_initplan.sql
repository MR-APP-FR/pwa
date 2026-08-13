-- Même recette que planning (20260812223600) : une seule policy SELECT
-- `admin OR own` + writes séparées + wrappers (SELECT fn()) pour InitPlan.
-- Tables à double SELECT permissive (admin ALL + employé own) qui vont grossir.
-- `data` a déjà un SELECT qual=true pour authenticated : ne pas y toucher.

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "availability admin all" ON public.availability;
DROP POLICY IF EXISTS "availability employee select own" ON public.availability;
DROP POLICY IF EXISTS "availability employee insert own" ON public.availability;
DROP POLICY IF EXISTS "availability employee update own" ON public.availability;

CREATE POLICY "availability select admin_or_own" ON public.availability
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "availability employee insert own" ON public.availability
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "availability admin insert" ON public.availability
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "availability employee update own" ON public.availability
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_employee_id()))
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "availability admin update" ON public.availability
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "availability admin delete" ON public.availability
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- opening_form
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "opening_form admin all" ON public.opening_form;
DROP POLICY IF EXISTS "opening_form employee select own" ON public.opening_form;
DROP POLICY IF EXISTS "opening_form employee insert own" ON public.opening_form;
DROP POLICY IF EXISTS "opening_form employee update own" ON public.opening_form;

CREATE POLICY "opening_form select admin_or_own" ON public.opening_form
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "opening_form employee insert own" ON public.opening_form
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "opening_form admin insert" ON public.opening_form
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "opening_form employee update own" ON public.opening_form
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_employee_id()))
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "opening_form admin update" ON public.opening_form
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "opening_form admin delete" ON public.opening_form
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- closing_form
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "closing_form admin all" ON public.closing_form;
DROP POLICY IF EXISTS "closing_form employee select own_or_partner" ON public.closing_form;
DROP POLICY IF EXISTS "closing_form employee insert own" ON public.closing_form;
DROP POLICY IF EXISTS "closing_form employee update own" ON public.closing_form;

CREATE POLICY "closing_form select admin_or_own" ON public.closing_form
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
    OR partner_user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "closing_form employee insert own" ON public.closing_form
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "closing_form admin insert" ON public.closing_form
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "closing_form employee update own" ON public.closing_form
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_employee_id()))
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "closing_form admin update" ON public.closing_form
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "closing_form admin delete" ON public.closing_form
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- daily_info (pas d'update employé aujourd'hui)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "daily_info admin all" ON public.daily_info;
DROP POLICY IF EXISTS "daily_info employee select own" ON public.daily_info;
DROP POLICY IF EXISTS "daily_info employee insert own" ON public.daily_info;

CREATE POLICY "daily_info select admin_or_own" ON public.daily_info
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "daily_info employee insert own" ON public.daily_info
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "daily_info admin insert" ON public.daily_info
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "daily_info admin update" ON public.daily_info
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "daily_info admin delete" ON public.daily_info
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- intervention
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "intervention admin all" ON public.intervention;
DROP POLICY IF EXISTS "intervention employee select own" ON public.intervention;
DROP POLICY IF EXISTS "intervention employee insert own" ON public.intervention;

CREATE POLICY "intervention select admin_or_own" ON public.intervention
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR reported_by = (SELECT public.current_employee_id())
    OR assignee_user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "intervention employee insert own" ON public.intervention
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = (SELECT public.current_employee_id()));

CREATE POLICY "intervention admin insert" ON public.intervention
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "intervention admin update" ON public.intervention
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "intervention admin delete" ON public.intervention
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- user_info
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_info admin all" ON public.user_info;
DROP POLICY IF EXISTS "user_info employee select own" ON public.user_info;
DROP POLICY IF EXISTS "user_info employee update own" ON public.user_info;

CREATE POLICY "user_info select admin_or_own" ON public.user_info
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "user_info admin insert" ON public.user_info
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "user_info employee update own" ON public.user_info
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_employee_id()))
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "user_info admin update" ON public.user_info
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "user_info admin delete" ON public.user_info
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- user_info_sites
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_info_sites admin all" ON public.user_info_sites;
DROP POLICY IF EXISTS "user_info_sites employee select own" ON public.user_info_sites;

CREATE POLICY "user_info_sites select admin_or_own" ON public.user_info_sites
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.user_info ui
      WHERE ui.id = user_info_sites.user_info_id
        AND ui.user_id = (SELECT public.current_employee_id())
    )
  );

CREATE POLICY "user_info_sites admin insert" ON public.user_info_sites
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "user_info_sites admin update" ON public.user_info_sites
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "user_info_sites admin delete" ON public.user_info_sites
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- staff_message — EXISTS planning + current_employee_id() non wrappé
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_message admin all" ON public.staff_message;
DROP POLICY IF EXISTS "staff_message employee select targeted" ON public.staff_message;

CREATE POLICY "staff_message select admin_or_targeted" ON public.staff_message
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (site_ids = '{}' AND user_ids = '{}')
    OR (SELECT public.current_employee_id()) = ANY (user_ids)
    OR EXISTS (
      SELECT 1
      FROM public.planning p
      WHERE (p.user_id = (SELECT public.current_employee_id())
          OR p.double_id = (SELECT public.current_employee_id()))
        AND p.site_id = ANY (staff_message.site_ids)
        AND p.year = EXTRACT(YEAR FROM CURRENT_DATE)::integer
        AND p.month = EXTRACT(MONTH FROM CURRENT_DATE)::integer
        AND p.day = EXTRACT(DAY FROM CURRENT_DATE)::integer
    )
  );

CREATE POLICY "staff_message admin insert" ON public.staff_message
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "staff_message admin update" ON public.staff_message
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "staff_message admin delete" ON public.staff_message
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- staff_message_ack
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_message_ack admin all" ON public.staff_message_ack;
DROP POLICY IF EXISTS "staff_message_ack employee select own" ON public.staff_message_ack;
DROP POLICY IF EXISTS "staff_message_ack employee insert own" ON public.staff_message_ack;
DROP POLICY IF EXISTS "staff_message_ack employee update own" ON public.staff_message_ack;

CREATE POLICY "staff_message_ack select admin_or_own" ON public.staff_message_ack
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR user_id = (SELECT public.current_employee_id())
  );

CREATE POLICY "staff_message_ack employee insert own" ON public.staff_message_ack
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "staff_message_ack admin insert" ON public.staff_message_ack
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "staff_message_ack employee update own" ON public.staff_message_ack
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_employee_id()))
  WITH CHECK (user_id = (SELECT public.current_employee_id()));

CREATE POLICY "staff_message_ack admin update" ON public.staff_message_ack
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "staff_message_ack admin delete" ON public.staff_message_ack
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- Index PWA / staff_message EXISTS : planning filtré par user + mois.
CREATE INDEX IF NOT EXISTS idx_planning_user_year_month
  ON public.planning (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_planning_double_year_month
  ON public.planning (double_id, year, month);
