-- Crons métier : pg_cron (SQL) + pg_net (Edge Functions).
-- Le secret vault `supabase_anon_key` est créé hors migration (jamais commité).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon;
REVOKE ALL ON SCHEMA internal FROM authenticated;
GRANT USAGE ON SCHEMA internal TO postgres;
GRANT USAGE ON SCHEMA internal TO supabase_admin;

CREATE UNIQUE INDEX IF NOT EXISTS staff_message_bureau_birthdays_day
  ON public.staff_message ((timezone('Europe/Paris', publie_at)::date))
  WHERE channel = 'bureau'
    AND source = 'appli'
    AND titre = 'Anniversaires';

CREATE OR REPLACE FUNCTION internal.paris_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public
AS $$
  SELECT (timezone('Europe/Paris', now()))::date;
$$;

CREATE OR REPLACE FUNCTION internal.is_leap_year(p_year integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO pg_catalog
AS $$
  SELECT (p_year % 4 = 0 AND p_year % 100 <> 0) OR (p_year % 400 = 0);
$$;

CREATE OR REPLACE FUNCTION internal.is_birthday_on_paris_day(p_dob date, p_today date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO pg_catalog, internal
AS $$
  SELECT p_dob IS NOT NULL AND (
    (EXTRACT(MONTH FROM p_dob) = EXTRACT(MONTH FROM p_today)
     AND EXTRACT(DAY FROM p_dob) = EXTRACT(DAY FROM p_today))
    OR (
      EXTRACT(MONTH FROM p_dob) = 2
      AND EXTRACT(DAY FROM p_dob) = 29
      AND EXTRACT(MONTH FROM p_today) = 2
      AND EXTRACT(DAY FROM p_today) = 28
      AND NOT internal.is_leap_year(EXTRACT(YEAR FROM p_today)::integer)
    )
  );
$$;

CREATE OR REPLACE FUNCTION internal.staff_birthday_name(
  p_first text,
  p_last text,
  p_fullname text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO pg_catalog
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_first, '')) <> '' AND btrim(coalesce(p_last, '')) <> ''
      THEN btrim(p_first) || ' ' || btrim(p_last)
    WHEN btrim(coalesce(p_first, '')) <> '' THEN btrim(p_first)
    WHEN btrim(coalesce(p_last, '')) <> '' THEN btrim(p_last)
    WHEN btrim(coalesce(p_fullname, '')) <> '' THEN btrim(p_fullname)
    ELSE 'Staff'
  END;
$$;

CREATE OR REPLACE FUNCTION internal.post_bureau_birthdays(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
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
      AND sm.titre = 'Anniversaires'
      AND timezone('Europe/Paris', sm.publie_at)::date = v_today
  ) THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_today',
      'names', to_jsonb(v_names)
    );
  END IF;

  v_corps := $txt$Aujourd'hui c'est l'anniversaire de:$txt$ || E'\n' ||
    array_to_string(ARRAY(SELECT '- ' || unnest(v_names)), E'\n');

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      'Anniversaires', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
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

CREATE OR REPLACE FUNCTION internal.post_bureau_weekly(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_dow integer := EXTRACT(ISODOW FROM v_today)::integer;
  v_body text := 'Qui pourrions-nous déclarer cette semaine ?';
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
      AND sm.corps = v_body
      AND date_trunc('week', timezone('Europe/Paris', sm.publie_at))
          = date_trunc('week', v_today::timestamp)
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_week');
  END IF;

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      v_body, v_body, 'appli', 'bureau', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_week');
  END;

  RETURN jsonb_build_object('inserted', true);
END;
$$;

CREATE OR REPLACE FUNCTION internal.post_cr_auto_monthly(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
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
  v_vendeurs text;
  v_sont text;
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
    WHERE sm.channel = 'cr_auto'
      AND sm.source = 'appli'
      AND sm.titre = 'Taux de déclaration'
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
    )
  INTO v_planned, v_declared;

  IF coalesce(v_planned, 0) = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'no_planning', 'planned', 0, 'declared', 0);
  END IF;

  v_pct := round((v_declared::numeric / v_planned::numeric) * 100)::integer;
  v_vendeurs := CASE WHEN v_planned = 1 THEN 'vendeur actif' ELSE 'vendeurs actifs' END;
  v_sont := CASE WHEN v_declared = 1 THEN 'est déclaré' ELSE 'sont déclarés' END;
  v_corps := format(
    'Ce mois-ci, sur %s %s, %s %s, soit %s %%. Pourrions-nous en déclarer certains autres ?',
    v_planned, v_vendeurs, v_declared, v_sont, v_pct
  );

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      'Taux de déclaration', v_corps, 'appli', 'cr_auto', NULL, '{}', '{}', false
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

CREATE OR REPLACE FUNCTION internal.invoke_edge(p_name text)
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
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 120000
  ) INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION internal.paris_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.is_leap_year(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.is_birthday_on_paris_day(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.staff_birthday_name(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.post_bureau_birthdays(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.post_bureau_weekly(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.post_cr_auto_monthly(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.invoke_edge(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION internal.paris_today() FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.is_leap_year(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.is_birthday_on_paris_day(date, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.staff_birthday_name(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.post_bureau_birthdays(boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.post_bureau_weekly(boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.post_cr_auto_monthly(boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.invoke_edge(text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION internal.paris_today() TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.is_leap_year(integer) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.is_birthday_on_paris_day(date, date) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.staff_birthday_name(text, text, text) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.post_bureau_birthdays(boolean) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.post_bureau_weekly(boolean) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.post_cr_auto_monthly(boolean) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.invoke_edge(text) TO postgres, supabase_admin;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'bureau-birthdays-utc4',
      'bureau-birthdays-utc5',
      'bureau-weekly-utc7',
      'cr-auto-monthly-utc7',
      'weather-sync-utc4',
      'opening-late-every-15m'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'bureau-birthdays-utc4',
  '0 4 * * *',
  $$SELECT internal.post_bureau_birthdays();$$
);
SELECT cron.schedule(
  'bureau-birthdays-utc5',
  '0 5 * * *',
  $$SELECT internal.post_bureau_birthdays();$$
);
SELECT cron.schedule(
  'bureau-weekly-utc7',
  '0 7 * * 1',
  $$SELECT internal.post_bureau_weekly();$$
);
SELECT cron.schedule(
  'cr-auto-monthly-utc7',
  '0 7 1 * *',
  $$SELECT internal.post_cr_auto_monthly();$$
);
SELECT cron.schedule(
  'weather-sync-utc4',
  '0 4 * * *',
  $$SELECT internal.invoke_edge('weather-sync');$$
);
SELECT cron.schedule(
  'opening-late-every-15m',
  '*/15 * * * *',
  $$SELECT internal.invoke_edge('opening-late');$$
);
