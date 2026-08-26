-- Canal admin CRM « CR AUTO » (rapports automatiques), invisible au staff PWA.
-- channel : staff | bureau | cr_auto

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_channel_check;

ALTER TABLE public.staff_message
  ADD CONSTRAINT staff_message_channel_check
  CHECK (channel IN ('staff', 'bureau', 'cr_auto'));

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_bureau_no_staff_target;

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_admin_channel_no_staff_target;

ALTER TABLE public.staff_message
  ADD CONSTRAINT staff_message_admin_channel_no_staff_target
  CHECK (
    channel = 'staff'
    OR (site_ids = '{}' AND user_ids = '{}')
  );

COMMENT ON COLUMN public.staff_message.channel IS
  'staff = employés ciblés ; bureau / cr_auto = canaux internes CRM (is_admin uniquement).';

-- Un recap auto par mois calendaire Europe/Paris (cron 1er du mois).
CREATE UNIQUE INDEX IF NOT EXISTS staff_message_cr_auto_monthly_decl_month
  ON public.staff_message (
    (date_trunc('month', timezone('Europe/Paris', publie_at)))
  )
  WHERE channel = 'cr_auto'
    AND source = 'appli'
    AND titre = 'Taux de déclaration';
