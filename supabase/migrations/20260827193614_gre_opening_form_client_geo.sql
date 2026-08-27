-- Position GPS à l'ouverture : ancre des 200 m à la fermeture
-- (les coords catalogue de site.latitude/longitude ne sont pas fiables).
-- Les ouvertures successives sur un même site serviront plus tard à estimer
-- la vraie position du manège.

ALTER TABLE public.opening_form
  ADD COLUMN IF NOT EXISTS client_lat double precision,
  ADD COLUMN IF NOT EXISTS client_lng double precision;

ALTER TABLE public.opening_form
  DROP CONSTRAINT IF EXISTS opening_form_client_coords_pair;
ALTER TABLE public.opening_form
  ADD CONSTRAINT opening_form_client_coords_pair
  CHECK (
    (client_lat IS NULL AND client_lng IS NULL)
    OR (
      client_lat IS NOT NULL
      AND client_lng IS NOT NULL
      AND client_lat >= -90 AND client_lat <= 90
      AND client_lng >= -180 AND client_lng <= 180
    )
  );

COMMENT ON COLUMN public.opening_form.client_lat IS
  'Latitude GPS au submit ouverture (ancre fermeture + analyse position site).';
COMMENT ON COLUMN public.opening_form.client_lng IS
  'Longitude GPS au submit ouverture (ancre fermeture + analyse position site).';

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
  open_lat double precision;
  open_lng double precision;
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

  SELECT of.client_lat, of.client_lng
  INTO open_lat, open_lng
  FROM public.opening_form AS of
  WHERE of.site_id = p_site_id
    AND of.date = p_date;

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
      'fermeture forcée à + de ' || p_distance_m::text || ' m de l''ouverture'
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
    'open_lat', open_lat,
    'open_lng', open_lng,
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

COMMENT ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) IS
  'Employe planifie : alerte canal bureau CRM lors d une fermeture forcee (distance vs ouverture / horaire), avec coords si dispo.';

REVOKE ALL ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) TO authenticated;
