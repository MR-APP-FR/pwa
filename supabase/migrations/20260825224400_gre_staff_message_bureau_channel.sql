-- Canal interne CRM : messages entre admins, invisibles au staff PWA.
-- channel = 'staff' (défaut, existant) | 'bureau' (admins CRM uniquement).

ALTER TABLE public.staff_message
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'staff';

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_channel_check;

ALTER TABLE public.staff_message
  ADD CONSTRAINT staff_message_channel_check
  CHECK (channel IN ('staff', 'bureau'));

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_bureau_no_staff_target;

ALTER TABLE public.staff_message
  ADD CONSTRAINT staff_message_bureau_no_staff_target
  CHECK (
    channel <> 'bureau'
    OR (site_ids = '{}' AND user_ids = '{}')
  );

COMMENT ON COLUMN public.staff_message.channel IS
  'staff = visible aux employés ciblés ; bureau = canal interne CRM (is_admin uniquement).';

-- Un prompt auto par semaine ISO (lundi Europe/Paris), pour le cron déclarations.
CREATE UNIQUE INDEX IF NOT EXISTS staff_message_bureau_weekly_decl_week
  ON public.staff_message (
    (date_trunc('week', timezone('Europe/Paris', publie_at)))
  )
  WHERE channel = 'bureau'
    AND source = 'appli'
    AND corps = 'Qui pourrions-nous déclarer cette semaine ?';

DROP POLICY IF EXISTS "staff_message select admin_or_targeted" ON public.staff_message;

CREATE POLICY "staff_message select admin_or_targeted" ON public.staff_message
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      channel = 'staff'
      AND (
        (site_ids = '{}' AND user_ids = '{}')
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
      )
    )
  );
