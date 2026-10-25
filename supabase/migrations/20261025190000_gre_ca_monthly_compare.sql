-- CA mensuel : message canal `ca` le 1er du mois (vs N-1 et N-2).
-- Compare le mois calendaire qui vient de se terminer (veille du 1er).

CREATE UNIQUE INDEX IF NOT EXISTS staff_message_ca_monthly_compare_month
  ON public.staff_message (
    ((meta ->> 'year')),
    ((meta ->> 'month'))
  )
  WHERE channel = 'ca'
    AND source = 'appli'
    AND meta ->> 'kind' = 'ca_monthly_compare';

CREATE OR REPLACE FUNCTION internal.format_euro_fr(p_amount numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both FROM replace(to_char(round(coalesce(p_amount, 0)), '999G999G999G999'), ',', ' ')) || ' €';
$$;

CREATE OR REPLACE FUNCTION internal.format_pct_fr(p_current numeric, p_ref numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pct integer;
BEGIN
  IF p_ref IS NULL OR p_ref = 0 THEN
    RETURN '—';
  END IF;
  v_pct := round(((p_current - p_ref) / p_ref) * 100)::integer;
  IF v_pct > 0 THEN
    RETURN '+' || v_pct::text || ' %';
  END IF;
  RETURN v_pct::text || ' %';
END;
$$;

CREATE OR REPLACE FUNCTION internal.month_label_fr(p_year integer, p_month integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_names text[] := ARRAY[
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RETURN p_year::text;
  END IF;
  RETURN v_names[p_month] || ' ' || p_year::text;
END;
$$;

CREATE OR REPLACE FUNCTION internal.sum_ca_month_total(p_year integer, p_month integer)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT coalesce(sum(d.total), 0)::numeric
  FROM public.data d
  JOIN public.site s ON s.id = d.site_id
  WHERE d.year = p_year
    AND d.month = p_month
    AND s.statut IS DISTINCT FROM 'automatique';
$$;

CREATE OR REPLACE FUNCTION internal.post_ca_monthly_compare(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_year integer;
  v_month integer;
  v_total numeric;
  v_n1 numeric;
  v_n2 numeric;
  v_corps text;
  v_meta jsonb;
BEGIN
  -- Mois clos = mois précédent (Paris).
  v_year := EXTRACT(YEAR FROM (v_today - 1))::integer;
  v_month := EXTRACT(MONTH FROM (v_today - 1))::integer;

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
    WHERE sm.channel = 'ca'
      AND sm.source = 'appli'
      AND sm.meta ->> 'kind' = 'ca_monthly_compare'
      AND sm.meta ->> 'year' = v_year::text
      AND sm.meta ->> 'month' = v_month::text
  ) THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_this_month',
      'year', v_year,
      'month', v_month
    );
  END IF;

  v_total := internal.sum_ca_month_total(v_year, v_month);
  v_n1 := internal.sum_ca_month_total(v_year - 1, v_month);
  v_n2 := internal.sum_ca_month_total(v_year - 2, v_month);

  IF coalesce(v_total, 0) = 0 AND coalesce(v_n1, 0) = 0 AND coalesce(v_n2, 0) = 0 THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'no_data',
      'year', v_year,
      'month', v_month
    );
  END IF;

  -- Corps « carré » (titre déjà 📈 CA mensuel) — labels alignés pour BureauMessageBody.
  v_corps := format(
    E'📅 Mois   : %s\n💶 Total  : %s\n📊 vs N-1 : %s\n📊 vs N-2 : %s',
    internal.month_label_fr(v_year, v_month),
    internal.format_euro_fr(v_total),
    internal.format_pct_fr(v_total, v_n1),
    internal.format_pct_fr(v_total, v_n2)
  );

  v_meta := jsonb_build_object(
    'kind', 'ca_monthly_compare',
    'year', v_year,
    'month', v_month,
    'total', v_total,
    'total_n1', v_n1,
    'total_n2', v_n2
  );

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
    ) VALUES (
      '📈 CA mensuel', v_corps, 'appli', 'ca', NULL, '{}', '{}', false, v_meta
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_this_month',
      'year', v_year,
      'month', v_month
    );
  END;

  RETURN jsonb_build_object(
    'inserted', true,
    'year', v_year,
    'month', v_month,
    'total', v_total,
    'total_n1', v_n1,
    'total_n2', v_n2
  );
END;
$$;

REVOKE ALL ON FUNCTION internal.format_euro_fr(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.format_pct_fr(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.month_label_fr(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.sum_ca_month_total(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.post_ca_monthly_compare(boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION internal.format_euro_fr(numeric) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.format_pct_fr(numeric, numeric) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.month_label_fr(integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.sum_ca_month_total(integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION internal.post_ca_monthly_compare(boolean) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION internal.format_euro_fr(numeric) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.format_pct_fr(numeric, numeric) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.month_label_fr(integer, integer) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.sum_ca_month_total(integer, integer) TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION internal.post_ca_monthly_compare(boolean) TO postgres, supabase_admin;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('ca-monthly-compare-utc7', 'ca-monthly-compare-utc8')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'ca-monthly-compare-utc7',
  '0 7 1 * *',
  $$SELECT internal.post_ca_monthly_compare();$$
);

SELECT cron.schedule(
  'ca-monthly-compare-utc8',
  '0 8 1 * *',
  $$SELECT internal.post_ca_monthly_compare();$$
);
