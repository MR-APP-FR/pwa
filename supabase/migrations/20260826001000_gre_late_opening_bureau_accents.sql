-- MCP a parfois strippe les accents / apostrophes dans le corps de la RPC.
-- chr() garantit le francais dans les messages Bureau.

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
    RAISE EXCEPTION '%', 'Compte non li' || chr(233) || ' ' || chr(224) || ' un employ' || chr(233);
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
      'employ' || chr(233) || ' #' || u.id::text
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
    hour_label := 'l' || chr(39) || 'horaire pr' || chr(233) || 'vu';
  END IF;

  corps := 'Motif: ouverture non effectu' || chr(233) || 'e apr' || chr(232) || 's ' || hour_label
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
  'Employe planifie : alerte canal bureau CRM si l ouverture n a pas ete faite a l heure.';

REVOKE ALL ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) TO authenticated;
