-- Tous les messages auto (Bureau / Inter) au modèle WhatsApp.
-- Inclut correctif stock feuilles (seuil 20) écrasé par gre_opening_low_feuilles_threshold_20.

-- ---------------------------------------------------------------------------
-- Stock ouverture (seuil feuilles / FDJ = 20)
-- ---------------------------------------------------------------------------
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
  pad integer := 7;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  low_feuilles := p_feuilles_count IS NOT NULL AND p_feuilles_count < 20;
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

COMMENT ON FUNCTION public.report_opening_low_stock_to_bureau(integer, date, integer, integer) IS
  'Alerte Bureau (modèle WhatsApp) : feuilles/FDJ < 20 ou tickets < 500.';

-- ---------------------------------------------------------------------------
-- Chrono lundi
-- ---------------------------------------------------------------------------
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
  mins integer;
  secs integer;
  ticket_name text;
  corps text;
  pad integer := 7;
  chrono_label text;
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  mins := p_chrono_seconds / 60;
  secs := p_chrono_seconds % 60;
  ticket_name := 'chrono mal calibré à ' || mins::text || 'min' || secs::text || 'sec';
  chrono_label := mins::text || ' min ' || secs::text || ' s';

  corps := '⏲️ Chrono mal calibré'
    || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad)
    || chr(10) || public.bureau_msg_line('⏲️', 'Chrono', chrono_label, pad)
    || chr(10) || public.bureau_msg_line('✅', 'Attendu', '2 min 25 s à 2 min 35 s', pad);

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '⚠️ Chrono',
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

-- ---------------------------------------------------------------------------
-- Ouverture lundi — manques
-- ---------------------------------------------------------------------------
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
  corps text;
  issues text := '';
  item_key text;
  item_label text;
  item_val jsonb;
  reste_val text;
  pad integer := 6;
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

  SELECT public.employee_display_name(p.user_id)
  INTO teneur_name
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
        issues := issues || chr(10) || '▪️ Panneau absent : ' || item_label;
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
        issues := issues || chr(10) || '▪️ Affaire insuffisante : ' || item_label;
        IF reste_val IS NOT NULL AND reste_val <> '' THEN
          issues := issues || ' (reste : ' || reste_val || ')';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF issues = '' THEN
    RETURN;
  END IF;

  corps := '📋 Manques lundi'
    || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad)
    || chr(10) || '📝 Détails :' || issues;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '⚠️ Ouverture',
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

-- ---------------------------------------------------------------------------
-- Anniversaires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.post_bureau_birthdays(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'internal'
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_names text[];
  v_corps text;
BEGIN
  IF NOT p_force AND v_hour <> 6 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'wrong_hour', 'hour', v_hour);
  END IF;

  SELECT coalesce(array_agg(n.nom ORDER BY n.nom), ARRAY[]::text[])
  INTO v_names
  FROM (
    SELECT DISTINCT internal.staff_birthday_name(ui.first_name, ui.last_name, u.fullname) AS nom
    FROM public.user_info ui
    JOIN public."user" u ON u.id = ui.user_id
    WHERE ui.date_de_naissance IS NOT NULL
      AND u.actif IS DISTINCT FROM false
      AND internal.is_birthday_on_paris_day(ui.date_de_naissance::date, v_today)
  ) n;

  IF coalesce(array_length(v_names, 1), 0) = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'none', 'names', '[]'::jsonb);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message sm
    WHERE sm.channel = 'bureau'
      AND sm.source = 'appli'
      AND sm.titre IN ('Anniversaires', '⚠️ Anniversaires')
      AND timezone('Europe/Paris', sm.publie_at)::date = v_today
  ) THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_today',
      'names', to_jsonb(v_names)
    );
  END IF;

  v_corps := '🎂 Anniversaire'
    || E'\n' || public.bureau_msg_line('📅', 'Date', to_char(v_today, 'DD/MM/YYYY'), 4)
    || E'\n' || '👤 ' || array_to_string(v_names, E'\n👤 ');

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      '⚠️ Anniversaires', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_today',
      'names', to_jsonb(v_names)
    );
  END;

  RETURN jsonb_build_object('inserted', true, 'names', to_jsonb(v_names));
END;
$$;

-- ---------------------------------------------------------------------------
-- Hebdo déclaration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.post_bureau_weekly(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'internal'
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_dow integer := EXTRACT(ISODOW FROM v_today)::integer;
  v_corps text;
BEGIN
  IF NOT p_force THEN
    IF v_dow <> 1 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'not_monday');
    END IF;
    IF v_hour < 8 OR v_hour > 10 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'wrong_hour', 'hour', v_hour);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message sm
    WHERE sm.channel = 'bureau'
      AND sm.source = 'appli'
      AND (
        sm.titre = '⚠️ Hebdo'
        OR sm.corps = 'Qui pourrions-nous déclarer cette semaine ?'
      )
      AND date_trunc('week', timezone('Europe/Paris', sm.publie_at))
          = date_trunc('week', v_today::timestamp)
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_week');
  END IF;

  v_corps := '💬 Qui pourrions-nous déclarer cette semaine ?'
    || E'\n' || public.bureau_msg_line('📅', 'Date', to_char(v_today, 'DD/MM/YYYY'), 4);

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      '⚠️ Hebdo', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_week');
  END;

  RETURN jsonb_build_object('inserted', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Taux de déclaration mensuel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.post_cr_auto_monthly(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'internal'
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_year integer := EXTRACT(YEAR FROM v_today)::integer;
  v_month integer := EXTRACT(MONTH FROM v_today)::integer;
  v_planned integer;
  v_declared integer;
  v_pct integer;
  v_corps text;
  pad integer := 9; -- « Planifiés »
BEGIN
  IF NOT p_force THEN
    IF EXTRACT(DAY FROM v_today)::integer <> 1 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'not_first');
    END IF;
    IF v_hour < 8 OR v_hour > 10 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'wrong_hour', 'hour', v_hour);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message sm
    WHERE sm.channel = 'bureau'
      AND sm.source = 'appli'
      AND sm.titre IN ('Taux de déclaration', '⚠️ Déclaration')
      AND date_trunc('month', timezone('Europe/Paris', sm.publie_at))
          = date_trunc('month', v_today::timestamp)
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_month');
  END IF;

  WITH ids AS (
    SELECT DISTINCT uid
    FROM (
      SELECT user_id AS uid
      FROM public.planning
      WHERE year = v_year AND month = v_month AND user_id IS NOT NULL AND user_id > 0
      UNION
      SELECT double_id
      FROM public.planning
      WHERE year = v_year AND month = v_month AND double_id IS NOT NULL AND double_id > 0
    ) s
  )
  SELECT
    (SELECT count(*)::integer FROM ids),
    (
      SELECT count(*)::integer
      FROM ids i
      LEFT JOIN public.user_info ui ON ui.user_id = i.uid
      WHERE ui.onoff IS DISTINCT FROM false
         OR ui.declaree IS TRUE
    )
  INTO v_planned, v_declared;

  IF coalesce(v_planned, 0) = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'no_planning', 'planned', 0, 'declared', 0);
  END IF;

  v_pct := round((v_declared::numeric / v_planned::numeric) * 100)::integer;
  v_corps := '📊 Taux de déclaration'
    || E'\n' || public.bureau_msg_line('📊', 'Taux', v_pct::text || ' %', pad)
    || E'\n' || public.bureau_msg_line('👤', 'Planifiés', v_planned::text, pad)
    || E'\n' || public.bureau_msg_line('✅', 'Déclarés', v_declared::text, pad)
    || E'\n' || public.bureau_msg_line('📅', 'Mois', to_char(v_today, 'MM/YYYY'), pad)
    || E'\n' || '💬 Pourrions-nous en déclarer certains autres ?';

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      '⚠️ Déclaration', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_this_month',
      'planned', v_planned,
      'declared', v_declared
    );
  END;

  RETURN jsonb_build_object('inserted', true, 'planned', v_planned, 'declared', v_declared);
END;
$$;

-- ---------------------------------------------------------------------------
-- Inter : nouvelle panne
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_inter_panne_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  site_label text;
  reporter_label text;
  sujet_line text;
  corps text;
  pad integer := 11; -- « Description »
  desc_text text;
BEGIN
  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = NEW.site_id;

  reporter_label := public.employee_display_name(NEW.reported_by);

  SELECT COALESCE(
    (
      SELECT string_agg(s.name, ', ' ORDER BY s.name)
      FROM public.sujets AS s
      WHERE s.id = ANY (NEW.sujet_ids)
    ),
    ''
  ) INTO sujet_line;

  IF sujet_line = '' THEN
    sujet_line := 'Autre';
  END IF;

  desc_text := COALESCE(
    nullif(btrim(NEW.pannes_autre), ''),
    nullif(btrim(NEW.description), ''),
    '-'
  );

  corps := CASE WHEN NEW.urgent THEN '🚨 Panne urgente' ELSE '🔧 Nouvelle panne' END
    || chr(10) || public.bureau_msg_line('📍', 'Site', upper(COALESCE(site_label, '-')), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Signalé par', COALESCE(reporter_label, '-'), pad)
    || chr(10) || public.bureau_msg_line('📅', 'Date', to_char(timezone('Europe/Paris', NEW.reported_at), 'DD/MM/YYYY'), pad)
    || chr(10) || public.bureau_msg_line('💬', 'Sujet', sujet_line, pad)
    || chr(10) || public.bureau_msg_line('📝', 'Description', desc_text, pad)
    || chr(10) || public.bureau_msg_line('🎫', 'Ticket', '#' || NEW.id::text, pad);

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    CASE WHEN NEW.urgent THEN '⚠️ Panne urgente' ELSE '⚠️ Panne' END,
    corps,
    'appli',
    'inter',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'panne_created',
      'site_id', NEW.site_id,
      'intervention_id', NEW.id,
      'urgent', NEW.urgent,
      'reported_by', NEW.reported_by
    )
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Inter : panne(s) résolue(s) à l'ouverture
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_pannes_from_opening(
  p_site_id integer,
  p_date date,
  p_intervention_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  resolver_label text;
  site_label text;
  teneur_name text;
  resolved_at_label text;
  corps text;
  ticket_block text;
  closed_ids bigint[] := '{}'::bigint[];
  rec record;
  sujet_line text;
  status_label text;
  schedule_label text;
  ticket_count integer := 0;
  pad integer := 14; -- « Date résolution »
BEGIN
  emp_id := public.assert_employee_on_site_mission(p_site_id, p_date);

  IF p_intervention_ids IS NULL OR cardinality(p_intervention_ids) = 0 THEN
    RETURN;
  END IF;

  resolver_label := public.employee_display_name(emp_id);
  resolved_at_label := to_char(timezone('Europe/Paris', now()), 'DD/MM/YYYY');

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

  corps := '✅ Panne résolue'
    || chr(10) || public.bureau_msg_line('📍', 'Site', upper(COALESCE(site_label, '-')), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Teneur', COALESCE(teneur_name, '-'), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Constaté par', COALESCE(resolver_label, '-'), pad)
    || chr(10) || public.bureau_msg_line('📅', 'Date résolution', resolved_at_label, pad);

  FOR rec IN
    SELECT
      i.id,
      i.description,
      i.pannes_autre,
      i.sujet_ids,
      i.status,
      i.reported_at,
      i.urgent,
      i.scheduled_at,
      COALESCE(
        (
          SELECT string_agg(s.name, ', ' ORDER BY s.name)
          FROM public.sujets AS s
          WHERE s.id = ANY (i.sujet_ids)
        ),
        ''
      ) AS sujet_names_line
    FROM public.intervention AS i
    WHERE i.id = ANY (p_intervention_ids)
      AND i.site_id = p_site_id
      AND i.status IN ('signalee', 'planifiee')
    ORDER BY i.id
  LOOP
    UPDATE public.intervention AS i
    SET
      status = 'cloturee',
      completed_at = now(),
      resolution_notes = 'Résolu à l''ouverture PWA le '
        || resolved_at_label
        || ' par ' || COALESCE(resolver_label, 'employé #' || emp_id::text)
    WHERE i.id = rec.id;

    closed_ids := array_append(closed_ids, rec.id);
    ticket_count := ticket_count + 1;

    status_label := CASE rec.status
      WHEN 'planifiee' THEN 'Programmé'
      ELSE 'Ouverte'
    END;

    schedule_label := CASE
      WHEN rec.scheduled_at IS NULL THEN NULL
      ELSE to_char(timezone('Europe/Paris', rec.scheduled_at), 'DD/MM/YYYY')
    END;

    sujet_line := CASE
      WHEN rec.sujet_names_line <> '' THEN rec.sujet_names_line
      ELSE 'Autre'
    END;

    ticket_block := chr(10) || chr(10)
      || '🎫 Ticket #' || rec.id::text
      || chr(10) || public.bureau_msg_line('💬', 'Sujet', sujet_line, pad)
      || chr(10) || public.bureau_msg_line(
           '📝',
           'Description',
           COALESCE(
             nullif(btrim(rec.pannes_autre), ''),
             nullif(btrim(rec.description), ''),
             '-'
           ),
           pad
         )
      || chr(10) || public.bureau_msg_line(
           '📅',
           'Signalé le',
           to_char(timezone('Europe/Paris', rec.reported_at), 'DD/MM/YYYY'),
           pad
         )
      || chr(10) || public.bureau_msg_line('📌', 'Statut avant', status_label, pad)
      || chr(10) || public.bureau_msg_line(
           '🚨', 'Urgent', CASE WHEN rec.urgent THEN 'oui' ELSE 'non' END, pad
         );

    IF schedule_label IS NOT NULL THEN
      ticket_block := ticket_block
        || chr(10) || public.bureau_msg_line('🗓️', 'Programmé le', schedule_label, pad);
    END IF;

    corps := corps || ticket_block;
  END LOOP;

  IF ticket_count = 0 THEN
    RETURN;
  END IF;

  IF ticket_count > 1 THEN
    corps := regexp_replace(corps, '^✅ Panne résolue', '✅ Pannes résolues');
  END IF;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    CASE
      WHEN ticket_count = 1 THEN '⚠️ Panne'
      ELSE '⚠️ Pannes'
    END,
    corps,
    'appli',
    'inter',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'panne_resolved',
      'site_id', p_site_id,
      'intervention_ids', closed_ids,
      'resolved_by', emp_id,
      'resolved_at', now()
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Pastille PWA : planning assigné (nouveau + ancien titre)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pwa_staff_message_badge_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  unread_staff integer := 0;
  unread_planning integer := 0;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL OR emp_id <= 0 THEN
    RETURN jsonb_build_object(
      'unread_staff', 0,
      'unread_planning_assigned', 0
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO unread_staff
  FROM public.staff_message AS sm
  LEFT JOIN public.staff_message_ack AS a
    ON a.message_id = sm.id
   AND a.user_id = emp_id
  WHERE sm.channel = 'staff'
    AND (
      CASE
        WHEN sm.require_ack THEN a.acked_at IS NULL
        ELSE a.read_at IS NULL
      END
    );

  SELECT COUNT(*)::integer
  INTO unread_planning
  FROM public.staff_message AS sm
  LEFT JOIN public.staff_message_ack AS a
    ON a.message_id = sm.id
   AND a.user_id = emp_id
  WHERE sm.channel = 'staff'
    AND sm.titre IN ('Planning semaine prochaine', '⚠️ Planning')
    AND (
      CASE
        WHEN sm.require_ack THEN a.acked_at IS NULL
        ELSE a.read_at IS NULL
      END
    );

  RETURN jsonb_build_object(
    'unread_staff', COALESCE(unread_staff, 0),
    'unread_planning_assigned', COALESCE(unread_planning, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_pwa_staff_message_badge_counts() IS
  'Pastilles PWA : staff non lu + planning assigné (titres legacy et ⚠️ Planning).';
