-- Carte parking absente : en plus du Bureau,
-- 1) message canal staff → zone Messages du site
-- 2) message + push au déclarant (teneur / double qui a coché Non)

-- ---------------------------------------------------------------------------
-- Helper : site_ids de la zone Messages (Paris = group_id ; Province = sous-zone CP)
-- Aligné CRM province-message-zones.ts + isListedOnSitesPage.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.message_zone_site_ids(p_site_id integer)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_group_id integer;
  v_group_name text;
  v_code_postal text;
  v_ville text;
  v_cp_ville text;
  v_cp_prefix text;
  v_ville_norm text;
  v_zone_id text;
  ids integer[];
BEGIN
  SELECT s.group_id, g.name, s.code_postal, s.ville, s.cp_ville
  INTO v_group_id, v_group_name, v_code_postal, v_ville, v_cp_ville
  FROM public.site AS s
  LEFT JOIN public.groupe AS g ON g.id = s.group_id
  WHERE s.id = p_site_id;

  IF v_group_id IS NULL THEN
    RETURN ARRAY[p_site_id];
  END IF;

  -- Paris : Intra / Nord / Sud → tous les sites listés du groupe
  IF v_group_name IN ('Paris Intra Muros', 'Zone Nord', 'Zone Sud') THEN
    SELECT COALESCE(ARRAY_AGG(s.id ORDER BY s.id), ARRAY[p_site_id])
    INTO ids
    FROM public.site AS s
    WHERE s.group_id = v_group_id
      AND COALESCE(s.statut, '') NOT IN ('ferme', 'temporaire');
    RETURN ids;
  END IF;

  -- Province : sous-zones Messages (Lyon / Grenoble / Marseille / Nice)
  IF v_group_name = 'Province' THEN
    v_cp_prefix := left(regexp_replace(COALESCE(v_code_postal, ''), '\D', '', 'g'), 2);
    IF v_cp_prefix IS NULL OR v_cp_prefix = '' THEN
      v_cp_prefix := substring(COALESCE(v_cp_ville, '') FROM '\m(\d{2})\d{3}\M');
    END IF;
    v_ville_norm := lower(
      translate(
        COALESCE(NULLIF(btrim(v_ville), ''), COALESCE(v_cp_ville, '')),
        'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
        'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'
      )
    );

    IF v_cp_prefix = '69' OR v_ville_norm LIKE '%lyon%' OR v_ville_norm LIKE '%villeurbanne%' THEN
      v_zone_id := 'lyon';
    ELSIF v_cp_prefix = '38' OR v_ville_norm LIKE '%grenoble%' THEN
      v_zone_id := 'grenoble';
    ELSIF v_cp_prefix = '13' OR v_ville_norm LIKE '%marseille%' THEN
      v_zone_id := 'marseille';
    ELSIF v_cp_prefix = '06' OR v_ville_norm LIKE '%nice%' THEN
      v_zone_id := 'nice';
    ELSE
      RETURN ARRAY[p_site_id];
    END IF;

    SELECT COALESCE(ARRAY_AGG(s.id ORDER BY s.id), ARRAY[p_site_id])
    INTO ids
    FROM public.site AS s
    WHERE s.group_id = v_group_id
      AND COALESCE(s.statut, '') NOT IN ('ferme', 'temporaire')
      AND (
        CASE v_zone_id
          WHEN 'lyon' THEN
            left(regexp_replace(COALESCE(s.code_postal, ''), '\D', '', 'g'), 2) = '69'
            OR lower(translate(COALESCE(s.ville, s.cp_ville, ''),
              'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
              'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'))
              LIKE ANY (ARRAY['%lyon%', '%villeurbanne%'])
          WHEN 'grenoble' THEN
            left(regexp_replace(COALESCE(s.code_postal, ''), '\D', '', 'g'), 2) = '38'
            OR lower(translate(COALESCE(s.ville, s.cp_ville, ''),
              'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
              'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'))
              LIKE '%grenoble%'
          WHEN 'marseille' THEN
            left(regexp_replace(COALESCE(s.code_postal, ''), '\D', '', 'g'), 2) = '13'
            OR lower(translate(COALESCE(s.ville, s.cp_ville, ''),
              'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
              'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'))
              LIKE '%marseille%'
          WHEN 'nice' THEN
            left(regexp_replace(COALESCE(s.code_postal, ''), '\D', '', 'g'), 2) = '06'
            OR lower(translate(COALESCE(s.ville, s.cp_ville, ''),
              'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
              'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'))
              LIKE '%nice%'
          ELSE FALSE
        END
      );
    RETURN ids;
  END IF;

  -- Autre groupe : sites listés du même group_id
  SELECT COALESCE(ARRAY_AGG(s.id ORDER BY s.id), ARRAY[p_site_id])
  INTO ids
  FROM public.site AS s
  WHERE s.group_id = v_group_id
    AND COALESCE(s.statut, '') NOT IN ('ferme', 'temporaire');
  RETURN ids;
END;
$$;

COMMENT ON FUNCTION public.message_zone_site_ids(integer) IS
  'site_ids ciblage Messages (zone Paris DB ou sous-zone Province CP), hors ferme/temporaire.';

REVOKE ALL ON FUNCTION public.message_zone_site_ids(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.message_zone_site_ids(integer) FROM anon;
REVOKE ALL ON FUNCTION public.message_zone_site_ids(integer) FROM authenticated;

-- ---------------------------------------------------------------------------
-- pg_net : invoke Edge avec body JSON (push staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.invoke_edge_json(p_name text, p_body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, net, vault
AS $$
DECLARE
  v_key text;
  v_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_anon_key'
  LIMIT 1;

  IF v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE EXCEPTION 'vault secret supabase_anon_key manquant';
  END IF;

  SELECT net.http_post(
    url := 'https://ooirydwzxltdtvlyhqar.supabase.co/functions/v1/' || p_name,
    body := COALESCE(p_body, '{}'::jsonb),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 30000
  ) INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION internal.invoke_edge_json(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.invoke_edge_json(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.invoke_edge_json(text, jsonb) TO postgres, supabase_admin;

-- ---------------------------------------------------------------------------
-- RPC principale
-- ---------------------------------------------------------------------------
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
  site_label_display text;
  teneur_name text;
  reporter_first text;
  corps text;
  zone_corps text;
  dm_corps text;
  zone_site_ids integer[];
  pad integer := 6; -- « Teneur »
  inserted_dm boolean := false;
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

  site_label_display := initcap(lower(site_label));

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  SELECT COALESCE(
    NULLIF(btrim(ui.first_name), ''),
    NULLIF(split_part(btrim(COALESCE(public.employee_display_name(emp_id), '')), ' ', 1), ''),
    'toi'
  )
  INTO reporter_first
  FROM (SELECT emp_id AS id) AS req
  LEFT JOIN public.user_info AS ui ON ui.user_id = req.id;

  -- 1) Canal Bureau (idempotent site × jour)
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'bureau'
      AND sm.meta->>'kind' = 'parking_card_missing'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
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
  END IF;

  -- 2) Message zone staff
  zone_site_ids := public.message_zone_site_ids(p_site_id);
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'staff'
      AND sm.meta->>'kind' = 'parking_card_missing_zone'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    zone_corps := site_label_display
      || ' : Bonjour, la carte de parking est introuvable. Quelqu''un sait où elle se trouve ?'
      || chr(10)
      || 'Pensez à prévenir Le bureau dès que vous la trouvez.';

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      'Carte parking',
      zone_corps,
      'appli',
      'staff',
      NULL,
      zone_site_ids,
      '{}'::integer[],
      false,
      jsonb_build_object(
        'kind', 'parking_card_missing_zone',
        'site_id', p_site_id,
        'date', p_date::text
      )
    );
  END IF;

  -- 3) DM + push au déclarant
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'staff'
      AND sm.meta->>'kind' = 'parking_card_missing_dm'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    dm_corps := 'Bonjour @' || reporter_first
      || ', tu as mentionné que la carte parking est absente. Tu ne l''as pas vue aujourd''hui ?'
      || chr(10)
      || 'Merci de contacter le bureau';

    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      'Carte parking',
      dm_corps,
      'appli',
      'staff',
      NULL,
      '{}'::integer[],
      ARRAY[emp_id]::integer[],
      false,
      jsonb_build_object(
        'kind', 'parking_card_missing_dm',
        'site_id', p_site_id,
        'date', p_date::text,
        'user_id', emp_id
      )
    );
    inserted_dm := true;
  END IF;

  IF inserted_dm THEN
    PERFORM internal.invoke_edge_json(
      'staff-push',
      jsonb_build_object(
        'pushes', jsonb_build_array(
          jsonb_build_object(
            'userId', emp_id,
            'title', 'Carte parking',
            'body', dm_corps,
            'url', '/messages'
          )
        )
      )
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.report_parking_card_missing(integer, date) IS
  'Ouverture : Bureau + message zone + DM/push déclarant si carte parking absente (idempotent site × jour).';

REVOKE ALL ON FUNCTION public.report_parking_card_missing(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_parking_card_missing(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_parking_card_missing(integer, date) TO authenticated;
