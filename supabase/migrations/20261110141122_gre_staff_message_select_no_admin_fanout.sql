-- PWA inbox : un admin ne doit plus voir toutes les copies zone d’un même
-- message fan-out (Tous + Nord + Sud + …). CRM lit via service role.
--
-- Avant : is_admin() court-circuitait → Kevin voyait ~7× le même corps.
-- Après : channel staff = ciblage employé uniquement ; canaux CRM = is_admin.

DROP POLICY IF EXISTS "staff_message select admin_or_targeted" ON public.staff_message;

CREATE POLICY "staff_message select admin_or_targeted" ON public.staff_message
  FOR SELECT TO authenticated
  USING (
    (
      channel IN ('bureau', 'ca', 'inter')
      AND (SELECT public.is_admin())
    )
    OR (
      channel = 'staff'
      AND (
        (site_ids = '{}'::integer[] AND user_ids = '{}'::integer[])
        OR (SELECT public.current_employee_id()) = ANY (user_ids)
        OR EXISTS (
          SELECT 1
          FROM public.user_info ui
          JOIN public.user_info_sites uis ON uis.user_info_id = ui.id
          WHERE ui.user_id = (SELECT public.current_employee_id())
            AND uis.site_id = ANY (staff_message.site_ids)
        )
        OR EXISTS (
          SELECT 1
          FROM public.planning p
          WHERE (
              p.user_id = (SELECT public.current_employee_id())
              OR p.double_id = (SELECT public.current_employee_id())
            )
            AND p.site_id = ANY (staff_message.site_ids)
            AND p.year = (EXTRACT(year FROM CURRENT_DATE))::integer
            AND p.month = (EXTRACT(month FROM CURRENT_DATE))::integer
            AND p.day = (EXTRACT(day FROM CURRENT_DATE))::integer
        )
      )
    )
  );
