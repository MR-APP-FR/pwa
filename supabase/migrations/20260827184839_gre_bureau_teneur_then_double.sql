-- Teneur (planning.user_id) en 1, double (planning.double_id) en 2 — plus de tri alpha.

CREATE OR REPLACE FUNCTION public.employee_display_name(p_user_id integer)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN NULL
    ELSE COALESCE(
      NULLIF(btrim(concat_ws(' ', ui.first_name, ui.last_name)), ''),
      NULLIF(btrim(u.fullname), ''),
      u.email,
      'employé #' || u.id::text
    )
  END
  FROM (SELECT p_user_id AS id) AS req
  LEFT JOIN public."user" AS u ON u.id = req.id
  LEFT JOIN public.user_info AS ui ON ui.user_id = u.id
$$;

COMMENT ON FUNCTION public.employee_display_name(integer) IS
  'Libellé affichage d un employé (prénom nom, sinon fullname / email).';

REVOKE ALL ON FUNCTION public.employee_display_name(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_display_name(integer) FROM anon;
REVOKE ALL ON FUNCTION public.employee_display_name(integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.report_forced_closing_to_bureau(
  p_site_id integer,
  p_date date,
  p_reason text,
  p_distance_m integer DEFAULT NULL,
  p_early boolean DEFAULT false,
  p_geo_failed boolean DEFAULT false,
  p_client_lat double precision DEFAULT NULL,
  p_client_lng double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  site_label text;
  site_lat double precision;
  site_lng double precision;
  teneur_name text;
  double_name text;
  motif text;
  corps text;
  reason text;
  payload jsonb;
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

  IF p_distance_m IS NULL AND COALESCE(p_early, false) IS NOT TRUE AND COALESCE(p_geo_failed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Aucun motif de forçage';
  END IF;
  IF p_distance_m IS NOT NULL AND (p_distance_m < 0 OR p_distance_m > 100000) THEN
    RAISE EXCEPTION 'Distance invalide';
  END IF;

  IF (p_client_lat IS NULL) <> (p_client_lng IS NULL) THEN
    RAISE EXCEPTION 'Position invalide';
  END IF;
  IF p_client_lat IS NOT NULL AND (
    p_client_lat < -90 OR p_client_lat > 90
    OR p_client_lng < -180 OR p_client_lng > 180
  ) THEN
    RAISE EXCEPTION 'Position invalide';
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

  SELECT s.name, s.latitude, s.longitude
  INTO site_label, site_lat, site_lng
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  SELECT
    public.employee_display_name(p.user_id),
    public.employee_display_name(p.double_id)
  INTO teneur_name, double_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  motif := CASE
    WHEN p_distance_m IS NOT NULL THEN
      'fermeture forcée à + de ' || p_distance_m::text || ' m du site'
    WHEN COALESCE(p_geo_failed, false) THEN
      'fermeture forcée (position non vérifiée)'
    ELSE
      NULL
  END;
  IF COALESCE(p_early, false) THEN
    motif := CASE
      WHEN motif IS NULL THEN 'fermeture forcée avant 20h05'
      ELSE motif || ', avant 20h05'
    END;
  END IF;

  corps := 'Motif: ' || motif
    || chr(10) || 'Site: ' || site_label
    || chr(10) || 'Teneur: ' || COALESCE(teneur_name, '-')
    || CASE
         WHEN double_name IS NULL THEN ''
         ELSE chr(10) || 'Double: ' || double_name
       END
    || chr(10) || 'Raison: ' || reason;

  payload := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'forced_closing',
    'site_id', p_site_id,
    'distance_m', p_distance_m,
    'early', COALESCE(p_early, false),
    'geo_failed', COALESCE(p_geo_failed, false),
    'site_lat', site_lat,
    'site_lng', site_lng,
    'client_lat', p_client_lat,
    'client_lng', p_client_lng
  ));

  INSERT INTO public.staff_message (
    titre,
    corps,
    source,
    channel,
    auteur_uuid,
    site_ids,
    user_ids,
    require_ack,
    meta
  ) VALUES (
    'Fermeture forcée',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    payload
  );
END;
$$;

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
  teneur_name text;
  double_name text;
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

  SELECT
    public.employee_display_name(p.user_id),
    public.employee_display_name(p.double_id)
  INTO teneur_name, double_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  hour_label := nullif(btrim(COALESCE(p_ouvre_label, '')), '');
  IF hour_label IS NULL THEN
    hour_label := 'l''horaire prévu';
  END IF;

  corps := 'Motif: ouverture non effectuée après ' || hour_label
    || chr(10) || 'Site: ' || site_label
    || chr(10) || 'Teneur: ' || COALESCE(teneur_name, '-')
    || CASE
         WHEN double_name IS NULL THEN ''
         ELSE chr(10) || 'Double: ' || double_name
       END
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
