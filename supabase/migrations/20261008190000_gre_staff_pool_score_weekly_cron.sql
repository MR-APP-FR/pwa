-- Recalcul hebdo des catégories staff (pool) — lundi ~09:00 Paris.
-- Même logique que l’ancien computeStaffPoolScores CRM (TS) :
--   1) inactifs absents planning > 62 j (Nouveau < 3 mois préservés)
--   2) prune user_info_sites sans présence > 122 j
--   3) scores pool mois Paris courant → staff_month_score
-- Cron : staff-pool-score-utc7 (lundi 07:00 UTC = 09:00 été / 08:00 hiver).

CREATE OR REPLACE FUNCTION internal.compute_staff_pool_scores(
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_dow integer := EXTRACT(ISODOW FROM v_today)::integer;
  v_year integer;
  v_month integer;
  v_from date;
  v_to date;
  v_cutoff_absent date;
  v_cutoff_site date;
  v_nouveau_cutoff date;
  v_week_start date;
  v_to_2w date;
  v_from_3m date;
  v_deactivated integer := 0;
  v_sites_pruned integer := 0;
  v_count integer := 0;
  c_min_days constant integer := 3;
  c_pts_ca_high constant numeric := 1.0;
  c_pts_ca_low constant numeric := 0.95;
BEGIN
  IF NOT p_force THEN
    IF v_dow <> 1 THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'not_monday');
    END IF;
    IF v_hour < 8 OR v_hour > 10 THEN
      RETURN jsonb_build_object(
        'ok', true, 'skipped', 'wrong_hour', 'hour', v_hour
      );
    END IF;
  END IF;

  v_year := COALESCE(p_year, EXTRACT(YEAR FROM v_today)::integer);
  v_month := COALESCE(p_month, EXTRACT(MONTH FROM v_today)::integer);
  v_to := v_today;
  v_from := v_today - 365;
  v_cutoff_absent := v_today - 62;
  v_cutoff_site := v_today - 122;
  v_nouveau_cutoff := (v_today - INTERVAL '3 months')::date;
  v_week_start := date_trunc('week', v_to::timestamp)::date;
  v_to_2w := v_week_start + 6;
  v_from_3m := v_to - 90;

  -- 1) Passer en inactif les absents planning > 62 j (hors Nouveau)
  WITH present AS (
    SELECT DISTINCT uid
    FROM public.planning p
    CROSS JOIN LATERAL (
      SELECT p.user_id AS uid WHERE p.user_id IS NOT NULL
      UNION ALL
      SELECT p.double_id
      WHERE p.double_id IS NOT NULL AND p.double_id IS DISTINCT FROM p.user_id
    ) u
    WHERE make_date(p.year, p.month, p.day) >= v_cutoff_absent
      AND make_date(p.year, p.month, p.day) <= v_today
  ),
  to_deactivate AS (
    SELECT u.id
    FROM public."user" u
    WHERE u.actif IS TRUE
      AND NOT EXISTS (SELECT 1 FROM present pr WHERE pr.uid = u.id)
      AND (
        u.registered IS NULL
        OR (timezone('Europe/Paris', u.registered AT TIME ZONE 'UTC'))::date
            <= v_nouveau_cutoff
      )
  ),
  updated AS (
    UPDATE public."user" u
    SET actif = false
    FROM to_deactivate d
    WHERE u.id = d.id
    RETURNING u.id
  )
  SELECT COUNT(*)::integer INTO v_deactivated FROM updated;

  -- 2) Retirer sites accessibles sans présence planning > 122 j
  WITH recent_work AS (
    SELECT DISTINCT u.uid, p.site_id
    FROM public.planning p
    CROSS JOIN LATERAL (
      SELECT p.user_id AS uid WHERE p.user_id IS NOT NULL
      UNION ALL
      SELECT p.double_id
      WHERE p.double_id IS NOT NULL AND p.double_id IS DISTINCT FROM p.user_id
    ) u
    WHERE make_date(p.year, p.month, p.day) >= v_cutoff_site
      AND make_date(p.year, p.month, p.day) <= v_today
  ),
  stale AS (
    SELECT uis.id
    FROM public.user_info_sites uis
    JOIN public.user_info ui ON ui.id = uis.user_info_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM recent_work rw
      WHERE rw.uid = ui.user_id
        AND rw.site_id = uis.site_id
    )
  ),
  deleted AS (
    DELETE FROM public.user_info_sites uis
    USING stale s
    WHERE uis.id = s.id
    RETURNING uis.id
  )
  SELECT COUNT(*)::integer INTO v_sites_pruned FROM deleted;

  -- 3) Perf + scores (aligné get_staff_performance + computeStaffPoolScores)
  WITH data_days AS (
    SELECT
      d.site_id,
      d.year,
      d.month,
      d.day,
      make_date(d.year, d.month, d.day) AS dt,
      EXTRACT(DOW FROM make_date(d.year, d.month, d.day))::integer AS dow,
      d.total::numeric AS total
    FROM public.data d
    WHERE (d.year, d.month, d.day)
        >= (
          EXTRACT(YEAR FROM v_from)::integer,
          EXTRACT(MONTH FROM v_from)::integer,
          EXTRACT(DAY FROM v_from)::integer
        )
      AND (d.year, d.month, d.day)
        <= (
          EXTRACT(YEAR FROM v_to)::integer,
          EXTRACT(MONTH FROM v_to)::integer,
          EXTRACT(DAY FROM v_to)::integer
        )
      AND d.total > 0
  ),
  baseline AS (
    SELECT dd.site_id, dd.dow, SUM(dd.total) / COUNT(*) AS expected
    FROM data_days dd
    GROUP BY dd.site_id, dd.dow
    HAVING COUNT(*) >= 3
  ),
  planning_staff AS (
    SELECT
      p.site_id,
      p.year,
      p.month,
      p.day,
      make_date(p.year, p.month, p.day) AS dt,
      u.uid
    FROM public.planning p
    CROSS JOIN LATERAL (
      SELECT p.user_id AS uid WHERE p.user_id IS NOT NULL
      UNION ALL
      SELECT p.double_id
      WHERE p.double_id IS NOT NULL AND p.double_id IS DISTINCT FROM p.user_id
    ) u
    WHERE (p.year, p.month, p.day)
        >= (
          EXTRACT(YEAR FROM v_from)::integer,
          EXTRACT(MONTH FROM v_from)::integer,
          EXTRACT(DAY FROM v_from)::integer
        )
      AND (p.year, p.month, p.day)
        <= (
          EXTRACT(YEAR FROM v_to_2w)::integer,
          EXTRACT(MONTH FROM v_to_2w)::integer,
          EXTRACT(DAY FROM v_to_2w)::integer
        )
  ),
  per_site AS (
    SELECT
      ps.uid AS user_id,
      ps.site_id,
      COALESCE(SUM(dd.total) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ), 0) AS actual,
      COALESCE(SUM(bl.expected) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ), 0) AS expected,
      COUNT(*) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ) AS days_worked,
      COUNT(*) FILTER (WHERE ps.dt >= v_from_3m AND ps.dt <= v_to) AS planned_3m
    FROM planning_staff ps
    LEFT JOIN data_days dd
      ON dd.site_id = ps.site_id
     AND dd.year = ps.year
     AND dd.month = ps.month
     AND dd.day = ps.day
    LEFT JOIN baseline bl
      ON bl.site_id = ps.site_id
     AND bl.dow = dd.dow
    GROUP BY ps.uid, ps.site_id
  ),
  overall AS (
    SELECT
      ps.user_id,
      COALESCE(SUM(ps.actual) FILTER (
        WHERE ps.expected > 0 AND ps.days_worked > 0
      ), 0) AS ca,
      COALESCE(SUM(ps.expected) FILTER (
        WHERE ps.expected > 0 AND ps.days_worked > 0
      ), 0) AS expected_ca,
      COALESCE(SUM(ps.days_worked) FILTER (
        WHERE ps.expected > 0 AND ps.days_worked > 0
      ), 0)::integer AS days_worked,
      COALESCE(SUM(ps.planned_3m), 0)::integer AS planned_3m,
      CASE
        WHEN COALESCE(SUM(ps.expected) FILTER (
          WHERE ps.expected > 0 AND ps.days_worked > 0
        ), 0) > 0
        THEN (
          COALESCE(SUM(ps.actual) FILTER (
            WHERE ps.expected > 0 AND ps.days_worked > 0
          ), 0)
          / COALESCE(SUM(ps.expected) FILTER (
            WHERE ps.expected > 0 AND ps.days_worked > 0
          ), 0)
        )
        ELSE NULL
      END AS perf_index
    FROM per_site ps
    GROUP BY ps.user_id
  ),
  medians AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY o.days_worked
      ) FILTER (WHERE o.days_worked >= c_min_days) AS median_days,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY o.planned_3m
      ) FILTER (WHERE o.planned_3m > 0) AS median_planned3m
    FROM overall o
  ),
  active_users AS (
    SELECT
      u.id AS user_id,
      u.registered,
      COALESCE(ui.chretienne, false) AS chretienne,
      COALESCE(ui.onoff, false) AS onoff,
      COALESCE(o.days_worked, 0) AS days_worked,
      COALESCE(o.planned_3m, 0) AS planned_3m,
      o.perf_index,
      m.median_days,
      m.median_planned3m
    FROM public."user" u
    LEFT JOIN public.user_info ui ON ui.user_id = u.id
    LEFT JOIN overall o ON o.user_id = u.id
    CROSS JOIN medians m
    WHERE u.actif IS TRUE
  ),
  scored AS (
    SELECT
      a.user_id,
      CASE
        WHEN a.days_worked >= c_min_days
          AND a.median_days IS NOT NULL
          AND a.days_worked >= a.median_days
        THEN 1 ELSE 0
      END AS pts_confiance,
      CASE
        WHEN a.perf_index IS NOT NULL AND a.days_worked >= c_min_days THEN
          CASE
            WHEN a.perf_index >= c_pts_ca_high THEN 1
            WHEN a.perf_index <= c_pts_ca_low THEN -1
            ELSE 0
          END
        ELSE 0
      END AS pts_ca,
      CASE WHEN a.chretienne THEN 1 ELSE 0 END AS pts_ponctualite,
      CASE WHEN a.onoff THEN 1 ELSE 0 END AS pts_nettoyage,
      CASE
        WHEN a.planned_3m > 0
          AND a.median_planned3m IS NOT NULL
          AND a.planned_3m >= a.median_planned3m
        THEN 1 ELSE 0
      END AS pts_avis,
      a.days_worked,
      a.registered
    FROM active_users a
  ),
  categorized AS (
    SELECT
      s.*,
      (s.pts_confiance + s.pts_ca + s.pts_ponctualite + s.pts_nettoyage + s.pts_avis)
        AS pts_sum,
      CASE
        WHEN s.days_worked < c_min_days
          OR (
            s.registered IS NOT NULL
            AND (timezone('Europe/Paris', s.registered AT TIME ZONE 'UTC'))::date
                > v_nouveau_cutoff
            AND s.days_worked < c_min_days
          )
        THEN 'normal'
        ELSE public.staff_category_from_score(
          s.pts_confiance + s.pts_ca + s.pts_ponctualite + s.pts_nettoyage + s.pts_avis
        )
      END AS category
    FROM scored s
  ),
  upserted AS (
    INSERT INTO public.staff_month_score AS sms (
      user_id,
      year,
      month,
      pts_confiance,
      pts_ca,
      pts_ponctualite,
      pts_nettoyage,
      pts_avis,
      category,
      computed_at
    )
    SELECT
      c.user_id,
      v_year,
      v_month,
      c.pts_confiance,
      c.pts_ca,
      c.pts_ponctualite,
      c.pts_nettoyage,
      c.pts_avis,
      c.category,
      now()
    FROM categorized c
    ON CONFLICT (user_id, year, month) DO UPDATE SET
      pts_confiance = EXCLUDED.pts_confiance,
      pts_ca = EXCLUDED.pts_ca,
      pts_ponctualite = EXCLUDED.pts_ponctualite,
      pts_nettoyage = EXCLUDED.pts_nettoyage,
      pts_avis = EXCLUDED.pts_avis,
      category = EXCLUDED.category,
      computed_at = EXCLUDED.computed_at
    RETURNING sms.user_id
  )
  SELECT COUNT(*)::integer INTO v_count FROM upserted;

  RETURN jsonb_build_object(
    'ok', true,
    'year', v_year,
    'month', v_month,
    'count', v_count,
    'deactivated', v_deactivated,
    'sites_pruned', v_sites_pruned
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_staff_pool_scores(
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN internal.compute_staff_pool_scores(p_year, p_month, true);
END;
$$;

REVOKE ALL ON FUNCTION internal.compute_staff_pool_scores(integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.compute_staff_pool_scores(integer, integer, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.compute_staff_pool_scores(integer, integer, boolean)
  TO postgres, supabase_admin;

REVOKE ALL ON FUNCTION public.compute_staff_pool_scores(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_staff_pool_scores(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_staff_pool_scores(integer, integer) TO authenticated;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'staff-pool-score-utc7',
      'staff-pool-score-utc8'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Lundi 07:00 UTC → 09:00 Paris été / 08:00 hiver (fenêtre 8–10 dans la fonction)
SELECT cron.schedule(
  'staff-pool-score-utc7',
  '0 7 * * 1',
  $$SELECT internal.compute_staff_pool_scores();$$
);

-- 2e passage DST (hiver : 08 UTC = 09 Paris)
SELECT cron.schedule(
  'staff-pool-score-utc8',
  '0 8 * * 1',
  $$SELECT internal.compute_staff_pool_scores();$$
);
