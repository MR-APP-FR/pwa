-- Messages Bureau auto : emoji par ligne pour un scan rapide (carré lisible).

CREATE OR REPLACE FUNCTION public.build_late_opening_corps(
  p_hour_label text,
  p_site_label text,
  p_teneur_name text,
  p_double_name text,
  p_reason text,
  p_opened_at timestamptz,
  p_deadline timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  corps text;
BEGIN
  corps := '⚠️ Motif: ouverture non effectuée après ' || p_hour_label
    || chr(10) || '📍 Site: ' || p_site_label
    || chr(10) || '👤 Teneur: ' || COALESCE(p_teneur_name, '-')
    || CASE
         WHEN p_double_name IS NULL THEN ''
         ELSE chr(10) || '👥 Double: ' || p_double_name
       END
    || chr(10) || '💬 Raison: ' || p_reason;

  IF p_opened_at IS NOT NULL THEN
    corps := corps
      || chr(10) || '🕐 Heure d''ouverture: ' || public.format_paris_hm(p_opened_at);
    IF p_deadline IS NOT NULL THEN
      corps := corps
        || chr(10) || '⏱️ Retard: ' || public.format_opening_late_delay(p_opened_at, p_deadline);
    END IF;
  END IF;

  RETURN corps;
END;
$$;

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

  corps := '⚠️ Motif: ' || motif
    || chr(10) || '📍 Site: ' || site_label
    || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-')
    || CASE
         WHEN double_name IS NULL THEN ''
         ELSE chr(10) || '👥 Double: ' || double_name
       END
    || chr(10) || '💬 Raison: ' || reason;

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
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '🚨 Fermeture forcée',
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

CREATE OR REPLACE FUNCTION public.report_opening_low_stock_to_bureau(
  p_site_id integer,
  p_date date,
  p_feuilles_count integer,
  p_tickets_ouverture integer
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
  corps text;
  low_feuilles boolean;
  low_tickets boolean;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  low_feuilles := p_feuilles_count IS NOT NULL AND p_feuilles_count < 10;
  low_tickets := p_tickets_ouverture IS NOT NULL AND p_tickets_ouverture < 500;

  IF NOT low_feuilles AND NOT low_tickets THEN
    RETURN;
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

  IF low_feuilles
     AND NOT EXISTS (
       SELECT 1
       FROM public.staff_message AS sm
       WHERE sm.channel = 'bureau'
         AND sm.meta->>'kind' = 'opening_low_feuilles'
         AND (sm.meta->>'site_id')::integer = p_site_id
         AND sm.meta->>'date' = p_date::text
     )
  THEN
    corps := '📄 Stock feuilles de jour bas'
      || chr(10) || '📍 Site: ' || site_label
      || chr(10) || '📅 Date: ' || to_char(p_date, 'DD/MM/YYYY')
      || chr(10) || '📄 Feuilles: ' || p_feuilles_count::text
      || chr(10) || '🔻 Seuil: < 10'
      || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-');
    IF double_name IS NOT NULL THEN
      corps := corps || chr(10) || '👥 Double: ' || double_name;
    END IF;

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '📄 Stock feuilles bas',
      corps,
      'appli',
      'bureau',
      NULL,
      '{}'::integer[],
      '{}'::integer[],
      false,
      jsonb_build_object(
        'kind', 'opening_low_feuilles',
        'site_id', p_site_id,
        'date', p_date::text,
        'feuilles_count', p_feuilles_count
      )
    );
  END IF;

  IF low_tickets
     AND NOT EXISTS (
       SELECT 1
       FROM public.staff_message AS sm
       WHERE sm.channel = 'bureau'
         AND sm.meta->>'kind' = 'opening_low_tickets'
         AND (sm.meta->>'site_id')::integer = p_site_id
         AND sm.meta->>'date' = p_date::text
     )
  THEN
    corps := '🎟️ Stock tickets d''ouverture bas'
      || chr(10) || '📍 Site: ' || site_label
      || chr(10) || '📅 Date: ' || to_char(p_date, 'DD/MM/YYYY')
      || chr(10) || '🎟️ Tickets: ' || p_tickets_ouverture::text
      || chr(10) || '🔻 Seuil: < 500'
      || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-');
    IF double_name IS NOT NULL THEN
      corps := corps || chr(10) || '👥 Double: ' || double_name;
    END IF;

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '🎟️ Stock tickets bas',
      corps,
      'appli',
      'bureau',
      NULL,
      '{}'::integer[],
      '{}'::integer[],
      false,
      jsonb_build_object(
        'kind', 'opening_low_tickets',
        'site_id', p_site_id,
        'date', p_date::text,
        'tickets_ouverture', p_tickets_ouverture
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_parking_card_missing(
  p_site_id integer,
  p_date date
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
  corps text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
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

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'bureau'
      AND sm.meta->>'kind' = 'parking_card_missing'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    RETURN;
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

  corps := '🅿️ Carte parking absente de la caisse'
    || chr(10) || '📍 Site: ' || site_label
    || chr(10) || '📅 Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-');
  IF double_name IS NOT NULL THEN
    corps := corps || chr(10) || '👥 Double: ' || double_name;
  END IF;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '🅿️ Carte parking absente',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'parking_card_missing',
      'site_id', p_site_id,
      'date', p_date::text
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_chrono_out_of_range(
  p_site_id integer,
  p_date date,
  p_chrono_seconds integer
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
  mins integer;
  secs integer;
  ticket_name text;
  corps text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  IF EXTRACT(ISODOW FROM p_date)::integer <> 1 THEN
    RAISE EXCEPTION 'Chrono hors borne uniquement le lundi';
  END IF;

  IF p_chrono_seconds IS NULL
     OR p_chrono_seconds < 0
     OR p_chrono_seconds > 5999 THEN
    RAISE EXCEPTION 'Chrono invalide';
  END IF;

  IF p_chrono_seconds >= 145 AND p_chrono_seconds <= 155 THEN
    RAISE EXCEPTION 'Chrono dans les bornes';
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

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'bureau'
      AND sm.meta->>'kind' = 'chrono_miscalibrated'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    RETURN;
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

  mins := p_chrono_seconds / 60;
  secs := p_chrono_seconds % 60;
  ticket_name := 'chrono mal calibré à ' || mins::text || 'min' || secs::text || 'sec';

  corps := '📍 Site: ' || site_label
    || chr(10) || '📅 Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || '⏲️ Chrono: ' || mins::text || ' min ' || secs::text || ' s'
    || chr(10) || '✅ Attendu: 2 min 25 s à 2 min 35 s'
    || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-');
  IF double_name IS NOT NULL THEN
    corps := corps || chr(10) || '👥 Double: ' || double_name;
  END IF;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '⏲️ Chrono mal calibré',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'chrono_miscalibrated',
      'site_id', p_site_id,
      'date', p_date::text,
      'chrono_seconds', p_chrono_seconds
    )
  );

  INSERT INTO public.intervention (
    site_id, daily_info_id, reported_by, reported_at, description,
    sujet_ids, pannes_autre, urgent, status
  ) VALUES (
    p_site_id, NULL, emp_id, now(), ticket_name,
    '{}'::integer[], ticket_name, true, 'signalee'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_monday_opening_issues_to_bureau(
  p_site_id integer,
  p_date date,
  p_payload jsonb
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
  corps text;
  issues text := '';
  item_key text;
  item_label text;
  item_val jsonb;
  reste_val text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  IF p_payload IS NULL OR p_payload = '{}'::jsonb THEN
    RETURN;
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

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'bureau'
      AND sm.meta->>'kind' = 'monday_opening_issues'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    RETURN;
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

  IF p_payload ? 'panneaux' AND jsonb_typeof(p_payload->'panneaux') = 'object' THEN
    FOR item_key, item_val IN
      SELECT key, value FROM jsonb_each(p_payload->'panneaux')
    LOOP
      IF item_val = 'false'::jsonb THEN
        item_label := CASE item_key
          WHEN 'prix' THEN 'Panneau Prix'
          WHEN 'consigne_securite' THEN 'Consigne de sécurité'
          WHEN 'info' THEN 'Info'
          WHEN 'reviens_5mn' THEN 'Je reviens dans 5mn'
          WHEN 'en_panne' THEN 'En panne'
          WHEN 'pause_dej' THEN 'Pause Dej'
          ELSE item_key
        END;
        issues := issues || chr(10) || '▪️ Panneau absent: ' || item_label;
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'affaires' AND jsonb_typeof(p_payload->'affaires') = 'object' THEN
    FOR item_key, item_val IN
      SELECT key, value FROM jsonb_each(p_payload->'affaires')
    LOOP
      IF COALESCE((item_val->>'present')::boolean, true) = false THEN
        item_label := CASE item_key
          WHEN 'produits_entretien' THEN 'Produits entretien'
          WHEN 'fournitures' THEN 'Fournitures'
          WHEN 'rouleaux_cb' THEN 'Rouleaux CB'
          ELSE item_key
        END;
        reste_val := item_val->>'reste';
        issues := issues || chr(10) || '▪️ Affaire insuffisante: ' || item_label;
        IF reste_val IS NOT NULL AND reste_val <> '' THEN
          issues := issues || ' (reste: ' || reste_val || ')';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF issues = '' THEN
    RETURN;
  END IF;

  corps := '📋 Ouverture lundi — manques signalés'
    || chr(10) || '📍 Site: ' || site_label
    || chr(10) || '📅 Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || '👤 Teneur: ' || COALESCE(teneur_name, '-');
  IF double_name IS NOT NULL THEN
    corps := corps || chr(10) || '👥 Double: ' || double_name;
  END IF;
  corps := corps || chr(10) || '📝 Détails:' || issues;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '📋 Ouverture lundi — manques',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'monday_opening_issues',
      'site_id', p_site_id,
      'date', p_date::text
    )
  );
END;
$$;

-- Titre du message retard (INSERT hardcodé dans report_late_opening_to_bureau)
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
  msg_id bigint;
  deadline timestamptz;
  opened_at timestamptz := now();
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

  deadline := public.site_opening_deadline_at(p_site_id, p_date);

  SELECT oform.submitted_at
  INTO opened_at
  FROM public.opening_form AS oform
  WHERE oform.site_id = p_site_id
    AND oform.date = p_date;
  IF opened_at IS NULL THEN
    opened_at := now();
  END IF;

  corps := public.build_late_opening_corps(
    hour_label, site_label, teneur_name, double_name, reason, opened_at, deadline
  );

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
  ) VALUES (
    '⏰ Ouverture en retard',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false
  )
  RETURNING id INTO msg_id;

  INSERT INTO public.opening_late_alert (
    site_id, date, report_user_id, report_reason, reported_at, bureau_message_id
  ) VALUES (
    p_site_id, p_date, emp_id, reason, now(), msg_id
  )
  ON CONFLICT (site_id, date) DO UPDATE
    SET report_user_id = EXCLUDED.report_user_id,
        report_reason = EXCLUDED.report_reason,
        reported_at = EXCLUDED.reported_at,
        bureau_message_id = EXCLUDED.bureau_message_id
    WHERE opening_late_alert.reported_at IS NULL;
END;
$$;

-- Enrichissement ouverture : titre inchangé si déjà avec emoji, match ancien + nouveau
CREATE OR REPLACE FUNCTION public.enrich_late_opening_bureau_from_opening_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alert_row public.opening_late_alert%ROWTYPE;
  site_label text;
  teneur_name text;
  double_name text;
  hour_label text;
  ouvre_raw text;
  jour_key text;
  deadline timestamptz;
  new_corps text;
BEGIN
  SELECT *
  INTO alert_row
  FROM public.opening_late_alert AS a
  WHERE a.site_id = NEW.site_id
    AND a.date = NEW.date
    AND a.reported_at IS NOT NULL
    AND a.bureau_message_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = NEW.site_id;

  SELECT
    public.employee_display_name(p.user_id),
    public.employee_display_name(p.double_id)
  INTO teneur_name, double_name
  FROM public.planning AS p
  WHERE p.site_id = NEW.site_id
    AND p.year = EXTRACT(YEAR FROM NEW.date)::integer
    AND p.month = EXTRACT(MONTH FROM NEW.date)::integer
    AND p.day = EXTRACT(DAY FROM NEW.date)::integer
  LIMIT 1;

  jour_key := EXTRACT(ISODOW FROM NEW.date)::integer::text;
  SELECT NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '')
  INTO ouvre_raw
  FROM public.site_infos AS si
  WHERE si.site_id = NEW.site_id;

  IF ouvre_raw IS NOT NULL AND ouvre_raw ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
    hour_label :=
      (regexp_match(ouvre_raw, '^(\d{1,2})'))[1]
      || 'H'
      || (regexp_match(ouvre_raw, ':(\d{2})'))[1];
  ELSE
    hour_label := 'l''horaire prévu';
  END IF;

  deadline := public.site_opening_deadline_at(NEW.site_id, NEW.date);

  new_corps := public.build_late_opening_corps(
    hour_label,
    COALESCE(site_label, '-'),
    teneur_name,
    double_name,
    COALESCE(alert_row.report_reason, '-'),
    NEW.submitted_at,
    deadline
  );

  UPDATE public.staff_message AS sm
  SET corps = new_corps,
      titre = '⏰ Ouverture en retard'
  WHERE sm.id = alert_row.bureau_message_id
    AND sm.channel = 'bureau'
    AND sm.titre IN ('Ouverture en retard', '⏰ Ouverture en retard');

  RETURN NEW;
END;
$$;

-- Rattrapage corps / titres récents (7 jours) sans doubler les emoji déjà présents
UPDATE public.staff_message
SET
  corps = CASE
    WHEN corps LIKE 'Stock feuilles de jour bas%' THEN '📄 ' || corps
    WHEN corps LIKE 'Stock tickets d''ouverture bas%' THEN '🎟️ ' || corps
    WHEN corps LIKE 'Carte parking absente de la caisse%' THEN '🅿️ ' || corps
    WHEN corps LIKE 'Ouverture lundi — manques signalés%' THEN '📋 ' || corps
    ELSE corps
  END,
  titre = CASE titre
    WHEN 'Ouverture en retard' THEN '⏰ Ouverture en retard'
    WHEN 'Fermeture forcée' THEN '🚨 Fermeture forcée'
    WHEN 'Stock feuilles bas' THEN '📄 Stock feuilles bas'
    WHEN 'Stock tickets bas' THEN '🎟️ Stock tickets bas'
    WHEN 'Carte parking absente' THEN '🅿️ Carte parking absente'
    WHEN 'Chrono mal calibré' THEN '⏲️ Chrono mal calibré'
    WHEN 'Ouverture lundi — manques' THEN '📋 Ouverture lundi — manques'
    ELSE titre
  END
WHERE source = 'appli'
  AND channel = 'bureau'
  AND publie_at >= (timezone('Europe/Paris', now()))::date - 7;

UPDATE public.staff_message
SET corps = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(corps, '(^|' || chr(10) || ')Motif:', '\1⚠️ Motif:', 'g'),
                          '(^|' || chr(10) || ')Site:', '\1📍 Site:', 'g'
                        ),
                        '(^|' || chr(10) || ')Date:', '\1📅 Date:', 'g'
                      ),
                      '(^|' || chr(10) || ')Teneur:', '\1👤 Teneur:', 'g'
                    ),
                    '(^|' || chr(10) || ')Double:', '\1👥 Double:', 'g'
                  ),
                  '(^|' || chr(10) || ')Raison:', '\1💬 Raison:', 'g'
                ),
                '(^|' || chr(10) || ')Heure d''ouverture:', E'\\1🕐 Heure d''ouverture:', 'g'
              ),
              '(^|' || chr(10) || ')Retard:', '\1⏱️ Retard:', 'g'
            ),
            '(^|' || chr(10) || ')Feuilles:', '\1📄 Feuilles:', 'g'
          ),
          '(^|' || chr(10) || ')Tickets:', '\1🎟️ Tickets:', 'g'
        ),
        '(^|' || chr(10) || ')Seuil:', '\1🔻 Seuil:', 'g'
      ),
      '(^|' || chr(10) || ')Chrono:', '\1⏲️ Chrono:', 'g'
    ),
    '(^|' || chr(10) || ')Attendu:', '\1✅ Attendu:', 'g'
  ),
  '(^|' || chr(10) || ')Détails:', '\1📝 Détails:', 'g'
)
WHERE source = 'appli'
  AND channel = 'bureau'
  AND publie_at >= (timezone('Europe/Paris', now()))::date - 7;
