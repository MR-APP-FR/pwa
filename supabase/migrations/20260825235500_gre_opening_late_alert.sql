-- Relances ouverture en retard : dédup push + signalement employé vers le Bureau.

CREATE TABLE public.opening_late_alert (
  site_id integer NOT NULL REFERENCES public.site(id) ON DELETE CASCADE,
  date date NOT NULL,
  teneur_user_id integer REFERENCES public."user"(id) ON DELETE SET NULL,
  push_sent_at timestamptz,
  reported_at timestamptz,
  report_user_id integer REFERENCES public."user"(id) ON DELETE SET NULL,
  report_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, date)
);

COMMENT ON TABLE public.opening_late_alert IS
  'Ouverture non faite après l''horaire du site : push teneur (cron) + raison envoyée au Bureau.';

ALTER TABLE public.opening_late_alert ENABLE ROW LEVEL SECURITY;

CREATE POLICY opening_late_alert_admin_all
  ON public.opening_late_alert
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY opening_late_alert_employee_select
  ON public.opening_late_alert
  FOR SELECT
  TO authenticated
  USING (
    public.current_employee_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.planning AS p
      WHERE p.site_id = opening_late_alert.site_id
        AND p.year = EXTRACT(YEAR FROM opening_late_alert.date)::integer
        AND p.month = EXTRACT(MONTH FROM opening_late_alert.date)::integer
        AND p.day = EXTRACT(DAY FROM opening_late_alert.date)::integer
        AND (p.user_id = public.current_employee_id() OR p.double_id = public.current_employee_id())
    )
  );

REVOKE ALL ON TABLE public.opening_late_alert FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_late_alert FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.opening_late_alert TO authenticated;

CREATE OR REPLACE FUNCTION public.report_late_opening_to_bureau(
  p_site_id integer,
  p_date date,
  p_reason text,
  p_ouvre_label text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  site_label text;
  teneur_label text;
  hour_label text;
  corps text;
  reason text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  reason := nullif(btrim(p_reason), '');
  IF reason IS NULL THEN
    RAISE EXCEPTION 'Raison obligatoire';
  END IF;
  IF char_length(reason) > 500 THEN
    RAISE EXCEPTION 'Raison trop longue';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.planning AS p
    WHERE p.site_id = p_site_id
      AND p.year = EXTRACT(YEAR FROM p_date)::integer
      AND p.month = EXTRACT(MONTH FROM p_date)::integer
      AND p.day = EXTRACT(DAY FROM p_date)::integer
      AND (p.user_id = emp_id OR p.double_id = emp_id)
  ) THEN
    RAISE EXCEPTION 'Pas de mission ce jour sur ce site';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.opening_late_alert AS a
    WHERE a.site_id = p_site_id
      AND a.date = p_date
      AND a.reported_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  SELECT string_agg(display, ', ' ORDER BY display)
  INTO teneur_label
  FROM (
    SELECT DISTINCT COALESCE(
      NULLIF(btrim(concat_ws(' ', ui.first_name, ui.last_name)), ''),
      NULLIF(btrim(u.fullname), ''),
      u.email,
      'employé #' || u.id::text
    ) AS display
    FROM public.planning AS p
    JOIN public."user" AS u ON u.id IN (p.user_id, p.double_id)
    LEFT JOIN public.user_info AS ui ON ui.user_id = u.id
    WHERE p.site_id = p_site_id
      AND p.year = EXTRACT(YEAR FROM p_date)::integer
      AND p.month = EXTRACT(MONTH FROM p_date)::integer
      AND p.day = EXTRACT(DAY FROM p_date)::integer
  ) AS names;

  hour_label := nullif(btrim(COALESCE(p_ouvre_label, '')), '');
  IF hour_label IS NULL THEN
    hour_label := 'l''horaire prévu';
  END IF;

  corps := 'Motif: ouverture non effectuée après ' || hour_label
    || chr(10) || 'Site: ' || site_label
    || chr(10) || 'Teneurs: ' || COALESCE(teneur_label, '-')
    || chr(10) || 'Raison: ' || reason;

  INSERT INTO public.staff_message (
    titre,
    corps,
    source,
    channel,
    auteur_uuid,
    site_ids,
    user_ids,
    require_ack
  ) VALUES (
    'Ouverture en retard',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false
  );

  INSERT INTO public.opening_late_alert (
    site_id,
    date,
    report_user_id,
    report_reason,
    reported_at
  ) VALUES (
    p_site_id,
    p_date,
    emp_id,
    reason,
    now()
  )
  ON CONFLICT (site_id, date) DO UPDATE
    SET report_user_id = EXCLUDED.report_user_id,
        report_reason = EXCLUDED.report_reason,
        reported_at = EXCLUDED.reported_at
    WHERE opening_late_alert.reported_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) IS
  'Employé planifié : alerte canal bureau CRM si l''ouverture n''a pas été faite à l''heure.';

REVOKE ALL ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) TO authenticated;
