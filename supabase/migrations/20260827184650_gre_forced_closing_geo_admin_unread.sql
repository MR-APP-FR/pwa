-- Fermeture forcée : coords dans staff_message.meta + badge lecture admin (canal Bureau).

ALTER TABLE public.staff_message
  ADD COLUMN IF NOT EXISTS meta jsonb;

COMMENT ON COLUMN public.staff_message.meta IS
  'Payload optionnel (ex. fermeture forcee : coords site / employe, distance).';

CREATE TABLE IF NOT EXISTS public.admin_message_cursor (
  auth_uid uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  bureau_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_message_cursor IS
  'Derniere lecture du canal Bureau par admin CRM (badge sidebar Messages).';

ALTER TABLE public.admin_message_cursor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_message_cursor_own ON public.admin_message_cursor;
CREATE POLICY admin_message_cursor_own
  ON public.admin_message_cursor
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()) AND auth_uid = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_admin()) AND auth_uid = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.admin_message_cursor FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_message_cursor FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_message_cursor TO authenticated;

DROP FUNCTION IF EXISTS public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean);

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
  teneur_label text;
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
    JOIN public.user AS u ON u.id IN (p.user_id, p.double_id)
    LEFT JOIN public.user_info AS ui ON ui.user_id = u.id
    WHERE p.site_id = p_site_id
      AND p.year = EXTRACT(YEAR FROM p_date)::integer
      AND p.month = EXTRACT(MONTH FROM p_date)::integer
      AND p.day = EXTRACT(DAY FROM p_date)::integer
  ) AS names;

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
    || chr(10) || 'Teneurs: ' || COALESCE(teneur_label, '-')
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

COMMENT ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) IS
  'Employe planifie : alerte canal bureau CRM lors d une fermeture forcee (distance / horaire), avec coords si dispo.';

REVOKE ALL ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_forced_closing_to_bureau(integer, date, text, integer, boolean, boolean, double precision, double precision) TO authenticated;
