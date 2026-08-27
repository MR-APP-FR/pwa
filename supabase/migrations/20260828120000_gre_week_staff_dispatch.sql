-- Suivi des envois hebdo dispos / planning + cron mercredi rappel dispos.

CREATE TABLE public.week_staff_dispatch (
  week_start date PRIMARY KEY,
  availability_reminded_at timestamptz,
  planning_sent_at timestamptz,
  planning_assigned_message_id bigint REFERENCES public.staff_message (id) ON DELETE SET NULL,
  planning_not_selected_message_id bigint REFERENCES public.staff_message (id) ON DELETE SET NULL,
  sent_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER week_staff_dispatch_set_updated_at
  BEFORE UPDATE ON public.week_staff_dispatch
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.week_staff_dispatch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "week_staff_dispatch admin all" ON public.week_staff_dispatch
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'availability-reminder-utc7',
      'availability-reminder-utc8'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'availability-reminder-utc7',
  '0 7 * * 3',
  $$SELECT internal.invoke_edge('availability-reminder');$$
);

SELECT cron.schedule(
  'availability-reminder-utc8',
  '0 8 * * 3',
  $$SELECT internal.invoke_edge('availability-reminder');$$
);
