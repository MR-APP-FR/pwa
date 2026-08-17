-- Un employé voit l'historique Tous + les messages de zone ciblant
-- un site où il est autorisé (user_info_sites) ou au planning du jour.
-- Sans ça, un message de zone disparaît dès qu'il n'est plus au planning.

DROP POLICY IF EXISTS "staff_message select admin_or_targeted" ON public.staff_message;

CREATE POLICY "staff_message select admin_or_targeted" ON public.staff_message
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (site_ids = '{}' AND user_ids = '{}')
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
      WHERE (p.user_id = (SELECT public.current_employee_id())
          OR p.double_id = (SELECT public.current_employee_id()))
        AND p.site_id = ANY (staff_message.site_ids)
        AND p.year = EXTRACT(YEAR FROM CURRENT_DATE)::integer
        AND p.month = EXTRACT(MONTH FROM CURRENT_DATE)::integer
        AND p.day = EXTRACT(DAY FROM CURRENT_DATE)::integer
    )
  );
