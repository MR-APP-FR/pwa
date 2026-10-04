-- Messages Bureau auto : modèle WhatsApp (titre ⚠️ + lignes alignées Site/Teneur/Date).

CREATE OR REPLACE FUNCTION public.bureau_msg_line(
  p_emoji text,
  p_label text,
  p_value text,
  p_pad integer DEFAULT 7
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_emoji
    || ' '
    || p_label
    || ' : '
    || repeat(' ', GREATEST(0, p_pad - char_length(p_label)))
    || p_value;
$$;

COMMENT ON FUNCTION public.bureau_msg_line(text, text, text, integer) IS
  'Ligne message Bureau : emoji Label : [pad]valeur (alignement type WhatsApp).';

CREATE OR REPLACE FUNCTION public.bureau_msg_common_lines(
  p_site_label text,
  p_teneur_name text,
  p_date date,
  p_pad integer DEFAULT 7
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.bureau_msg_line('📍', 'Site', upper(COALESCE(p_site_label, '-')), p_pad)
    || chr(10) || public.bureau_msg_line('👤', 'Teneur', COALESCE(p_teneur_name, '-'), p_pad)
    || chr(10) || public.bureau_msg_line('📅', 'Date', to_char(p_date, 'DD/MM/YYYY'), p_pad);
$$;

DROP FUNCTION IF EXISTS public.build_late_opening_corps(text, text, text, text, text, timestamptz, timestamptz);

CREATE FUNCTION public.build_late_opening_corps(
  p_site_label text,
  p_teneur_name text,
  p_reason text,
  p_date date,
  p_opened_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pad integer := 17; -- « Heure d'ouverture »
  corps text;
BEGIN
  corps := '⏰ Ouverture en retard'
    || chr(10) || public.bureau_msg_common_lines(p_site_label, p_teneur_name, p_date, pad)
    || chr(10) || public.bureau_msg_line('💬', 'Raison', p_reason, pad);

  IF p_opened_at IS NOT NULL THEN
    corps := corps
      || chr(10)
      || public.bureau_msg_line(
           '🕒',
           'Heure d''ouverture',
           public.format_paris_hm(p_opened_at),
           pad
         );
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
  motif text;
  corps text;
  reason text;
  payload jsonb;
  pad integer := 18; -- « Heure de fermeture »
  closed_at timestamptz := now();
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  -- Motif technique conservé dans meta (détail CRM), corps = modèle court.
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

  corps := '🔒 Fermeture forcée'
    || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad)
    || chr(10) || public.bureau_msg_line('💬', 'Raison', reason, pad)
    || chr(10) || public.bureau_msg_line(
         '🕒', 'Heure de fermeture', public.format_paris_hm(closed_at), pad
       );

  payload := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'forced_closing',
    'site_id', p_site_id,
    'distance_m', p_distance_m,
    'early', COALESCE(p_early, false),
    'geo_failed', COALESCE(p_geo_failed, false),
    'motif', motif,
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
    '⚠️ Fermeture',
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
  corps text;
  low_feuilles boolean;
  low_tickets boolean;
  pad integer := 7; -- « Tickets » / « Feuilles »
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
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
    corps := public.bureau_msg_line('📄', 'Feuilles', p_feuilles_count::text, pad)
      || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad);

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '⚠️ Feuilles : Niveau bas',
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
    corps := public.bureau_msg_line('🎟️', 'Tickets', p_tickets_ouverture::text, pad)
      || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad);

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '⚠️ Tickets : Niveau bas',
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
  corps text;
  pad integer := 6; -- « Teneur »
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  corps := '🅿️ Carte parking absente'
    || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad);

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '⚠️ Carte Parking',
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
  corps text;
  reason text;
  msg_id bigint;
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  SELECT oform.submitted_at
  INTO opened_at
  FROM public.opening_form AS oform
  WHERE oform.site_id = p_site_id
    AND oform.date = p_date;
  IF opened_at IS NULL THEN
    opened_at := now();
  END IF;

  corps := public.build_late_opening_corps(
    site_label, teneur_name, reason, p_date, opened_at
  );

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
  ) VALUES (
    '⚠️ Ouverture',
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = NEW.site_id
    AND p.year = EXTRACT(YEAR FROM NEW.date)::integer
    AND p.month = EXTRACT(MONTH FROM NEW.date)::integer
    AND p.day = EXTRACT(DAY FROM NEW.date)::integer
  LIMIT 1;

  new_corps := public.build_late_opening_corps(
    COALESCE(site_label, '-'),
    teneur_name,
    COALESCE(alert_row.report_reason, '-'),
    NEW.date,
    NEW.submitted_at
  );

  UPDATE public.staff_message AS sm
  SET corps = new_corps,
      titre = '⚠️ Ouverture'
  WHERE sm.id = alert_row.bureau_message_id
    AND sm.channel = 'bureau'
    AND sm.titre IN (
      'Ouverture en retard',
      '⏰ Ouverture en retard',
      '⚠️ Ouverture'
    );

  RETURN NEW;
END;
$$;
