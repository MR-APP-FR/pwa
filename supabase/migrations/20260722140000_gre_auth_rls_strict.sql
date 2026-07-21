-- Étape 5 — Auth réelle + activation RLS stricte
-- cf. docs/CADRAGE-PROD-PWA.md §4.2 / §4.3 / Étape 5
--
-- Ordre :
--   1) policies manquantes / resserrement (planning, user, user_info*, site_infos, sujets, storage)
--   2) DROP de toutes les policies "pwa demo anon %"
--   3) REVOKE get_demo_employees FROM anon (+ drop usage PWA)

-- ---------------------------------------------------------------------------
-- Helpers : s'assurer que authenticated peut appeler current_employee_id()
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- planning : restreindre la lecture employé (user_id / double_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to read planning" ON public.planning;

CREATE POLICY "planning employee select own_or_double" ON public.planning
  FOR SELECT TO authenticated
  USING (
    user_id = current_employee_id()
    OR double_id = current_employee_id()
  );

-- ---------------------------------------------------------------------------
-- user : SELECT employés actifs (collègues planning) ; écritures admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to read user" ON public."user";

CREATE POLICY "user authenticated select active" ON public."user"
  FOR SELECT TO authenticated
  USING (actif IS DISTINCT FROM false);

-- ---------------------------------------------------------------------------
-- user_info : réécrire legacy JWT claim → current_employee_id() / is_admin()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete user info" ON public.user_info;
DROP POLICY IF EXISTS "Admins can insert user info" ON public.user_info;
DROP POLICY IF EXISTS "Admins can update all user info" ON public.user_info;
DROP POLICY IF EXISTS "Admins can view all user info" ON public.user_info;
DROP POLICY IF EXISTS "Users can update their own user info" ON public.user_info;
DROP POLICY IF EXISTS "Users can view their own user info" ON public.user_info;

CREATE POLICY "user_info admin all" ON public.user_info
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "user_info employee select own" ON public.user_info
  FOR SELECT TO authenticated
  USING (user_id = current_employee_id());

CREATE POLICY "user_info employee update own" ON public.user_info
  FOR UPDATE TO authenticated
  USING (user_id = current_employee_id())
  WITH CHECK (user_id = current_employee_id());

-- ---------------------------------------------------------------------------
-- user_info_sites : employé = sites de SON user_info ; écritures admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete user_info_sites" ON public.user_info_sites;
DROP POLICY IF EXISTS "Admins can insert user_info_sites" ON public.user_info_sites;
DROP POLICY IF EXISTS "Admins can update user_info_sites" ON public.user_info_sites;
DROP POLICY IF EXISTS "Authenticated users can view user_info_sites" ON public.user_info_sites;

CREATE POLICY "user_info_sites admin all" ON public.user_info_sites
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "user_info_sites employee select own" ON public.user_info_sites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_info ui
      WHERE ui.id = user_info_sites.user_info_id
        AND ui.user_id = current_employee_id()
    )
  );

-- ---------------------------------------------------------------------------
-- site_infos : SELECT authenticated OK ; écritures admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "site_infos_authenticated_insert" ON public.site_infos;
DROP POLICY IF EXISTS "site_infos_authenticated_update" ON public.site_infos;
DROP POLICY IF EXISTS "site_infos_authenticated_delete" ON public.site_infos;
-- SELECT authenticated déjà présent (site_infos_authenticated_select) — on le garde.

CREATE POLICY "site_infos admin write" ON public.site_infos
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- sujets : SELECT all ; INSERT employé ; UPDATE/DELETE admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sujets_authenticated_insert" ON public.sujets;
DROP POLICY IF EXISTS "sujets_authenticated_update" ON public.sujets;
DROP POLICY IF EXISTS "sujets_authenticated_delete" ON public.sujets;
-- SELECT authenticated (sujets_authenticated_select) conservé.

CREATE POLICY "sujets employee insert" ON public.sujets
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "sujets admin update" ON public.sujets
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "sujets admin delete" ON public.sujets
  FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- Storage telecollecte-photos : policies authenticated AVANT drop anon
-- ---------------------------------------------------------------------------
CREATE POLICY "telecollecte authenticated select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'telecollecte-photos');

CREATE POLICY "telecollecte authenticated insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'telecollecte-photos');

-- ---------------------------------------------------------------------------
-- DROP toutes les policies démo anon (tables + storage)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "pwa demo anon select availability" ON public.availability;
DROP POLICY IF EXISTS "pwa demo anon insert availability" ON public.availability;
DROP POLICY IF EXISTS "pwa demo anon update availability" ON public.availability;

DROP POLICY IF EXISTS "pwa demo anon select opening_form" ON public.opening_form;
DROP POLICY IF EXISTS "pwa demo anon insert opening_form" ON public.opening_form;
DROP POLICY IF EXISTS "pwa demo anon update opening_form" ON public.opening_form;

DROP POLICY IF EXISTS "pwa demo anon select closing_form" ON public.closing_form;
DROP POLICY IF EXISTS "pwa demo anon insert closing_form" ON public.closing_form;
DROP POLICY IF EXISTS "pwa demo anon update closing_form" ON public.closing_form;

DROP POLICY IF EXISTS "pwa demo anon select daily_info" ON public.daily_info;
DROP POLICY IF EXISTS "pwa demo anon insert daily_info" ON public.daily_info;

DROP POLICY IF EXISTS "pwa demo anon select intervention" ON public.intervention;
DROP POLICY IF EXISTS "pwa demo anon insert intervention" ON public.intervention;

DROP POLICY IF EXISTS "pwa demo anon read planning" ON public.planning;
DROP POLICY IF EXISTS "pwa demo anon read site" ON public.site;
DROP POLICY IF EXISTS "pwa demo anon read site_infos" ON public.site_infos;
DROP POLICY IF EXISTS "pwa demo anon read sujets" ON public.sujets;
DROP POLICY IF EXISTS "pwa demo anon insert sujets" ON public.sujets;
DROP POLICY IF EXISTS "pwa demo anon read user" ON public."user";
DROP POLICY IF EXISTS "pwa demo anon read user_info" ON public.user_info;
DROP POLICY IF EXISTS "pwa demo anon read user_info_sites" ON public.user_info_sites;

DROP POLICY IF EXISTS "pwa demo anon read telecollecte-photos" ON storage.objects;
DROP POLICY IF EXISTS "pwa demo anon write telecollecte-photos" ON storage.objects;

-- ---------------------------------------------------------------------------
-- RPC démo : plus d'accès anon
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_demo_employees() FROM anon;
-- Gardé pour admin éventuel ; PWA n'appelle plus cette RPC.
GRANT EXECUTE ON FUNCTION public.get_demo_employees() TO authenticated;
