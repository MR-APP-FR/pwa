-- Fermeture : `heures_semaine.ferme` = heure manège (sans marge).
-- L'appli ajoute +5 min pour la validation classique / télécollecte.
-- Backfill : retirer 5 min des `ferme` historiques déjà saisis en XX:05 / XX:35.
-- Plus de pastille CRM « fermeture en retard » (late_closing toujours 0).

CREATE OR REPLACE FUNCTION public.gre_heures_ferme_minus_minutes(hs jsonb, p_minutes integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  day jsonb;
  ferme text;
  h integer;
  mi integer;
  total integer;
  new_ferme text;
  out_hs jsonb := hs;
BEGIN
  IF hs IS NULL OR jsonb_typeof(hs) <> 'object' THEN
    RETURN hs;
  END IF;
  FOR k IN SELECT jsonb_object_keys(hs)
  LOOP
    day := hs -> k;
    IF day IS NULL OR jsonb_typeof(day) <> 'object' THEN
      CONTINUE;
    END IF;
    ferme := nullif(btrim(day ->> 'ferme'), '');
    IF ferme IS NULL THEN
      CONTINUE;
    END IF;
    IF ferme !~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
      CONTINUE;
    END IF;
    h := split_part(ferme, ':', 1)::integer;
    mi := split_part(ferme, ':', 2)::integer;
    total := greatest(0, h * 60 + mi - p_minutes);
    new_ferme :=
      lpad((total / 60)::text, 2, '0')
      || ':'
      || lpad((total % 60)::text, 2, '0')
      || ':00';
    out_hs := jsonb_set(out_hs, ARRAY[k, 'ferme'], to_jsonb(new_ferme), true);
  END LOOP;
  RETURN out_hs;
END;
$$;

UPDATE public.site_infos
SET heures_semaine = public.gre_heures_ferme_minus_minutes(heures_semaine, 5)
WHERE heures_semaine IS NOT NULL;

DROP FUNCTION public.gre_heures_ferme_minus_minutes(jsonb, integer);

CREATE OR REPLACE FUNCTION public.get_crm_badge_counts(p_now timestamp with time zone DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  paris_ts timestamp;
  paris_date date;
  y integer;
  m integer;
  d integer;
  jour_key text;
  late_opening integer := 0;
  bureau_unread integer := 0;
  uid uuid;
  seen_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'late_opening', 0,
      'late_closing', 0,
      'bureau_unread', 0
    );
  END IF;

  paris_ts := timezone('Europe/Paris', p_now);
  paris_date := paris_ts::date;
  y := EXTRACT(YEAR FROM paris_ts)::integer;
  m := EXTRACT(MONTH FROM paris_ts)::integer;
  d := EXTRACT(DAY FROM paris_ts)::integer;
  jour_key := EXTRACT(ISODOW FROM paris_ts)::integer::text;

  SELECT COUNT(*)::integer
  INTO late_opening
  FROM (
    SELECT DISTINCT ON (p.site_id) p.site_id
    FROM public.planning AS p
    INNER JOIN public.site_infos AS si ON si.site_id = p.site_id
    WHERE p.year = y
      AND p.month = m
      AND p.day = d
      AND COALESCE(p.closed, false) IS NOT TRUE
      AND (p.user_id IS NOT NULL OR p.double_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM public.opening_form AS oform
        WHERE oform.site_id = p.site_id
          AND oform.date = paris_date
      )
      AND NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '') IS NOT NULL
      AND (si.heures_semaine -> jour_key ->> 'ouvre') ~ '^\d{1,2}:\d{2}(:\d{2})?$'
      AND p_now > (
        (
          paris_date::text
          || ' '
          || CASE
            WHEN length(btrim(si.heures_semaine -> jour_key ->> 'ouvre')) = 5
              THEN btrim(si.heures_semaine -> jour_key ->> 'ouvre') || ':00'
            ELSE btrim(si.heures_semaine -> jour_key ->> 'ouvre')
          END
        )::timestamp
        AT TIME ZONE 'Europe/Paris'
      )
    ORDER BY p.site_id
  ) AS late_sites;

  uid := auth.uid();
  IF uid IS NOT NULL THEN
    SELECT c.bureau_seen_at
    INTO seen_at
    FROM public.admin_message_cursor AS c
    WHERE c.auth_uid = uid;

    IF seen_at IS NULL THEN
      INSERT INTO public.admin_message_cursor (auth_uid, bureau_seen_at, updated_at)
      VALUES (uid, p_now, p_now)
      ON CONFLICT (auth_uid) DO UPDATE
        SET bureau_seen_at = EXCLUDED.bureau_seen_at,
            updated_at = EXCLUDED.updated_at;
      bureau_unread := 0;
    ELSE
      SELECT COUNT(*)::integer
      INTO bureau_unread
      FROM public.staff_message AS sm
      WHERE sm.channel = 'bureau'
        AND sm.publie_at > seen_at;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'late_opening', COALESCE(late_opening, 0),
    'late_closing', 0,
    'bureau_unread', COALESCE(bureau_unread, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_crm_badge_counts(timestamptz) IS
  'Admin : pastilles ouverture en retard + bureau non lu. late_closing toujours 0 (pas de notion retard fermeture).';

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
      WHEN motif IS NULL THEN 'fermeture forcée avant l''heure prévue'
      ELSE motif || ', avant l''heure prévue'
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
  'Employe planifie : alerte canal bureau CRM lors d une fermeture forcee (distance vs ouverture / horaire site + 5 min), avec coords si dispo.';
