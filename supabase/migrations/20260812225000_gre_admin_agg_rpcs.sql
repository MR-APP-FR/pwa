-- Agrégations CA / staff en SQL (SECURITY DEFINER + is_admin).
-- PostgREST coupe à 1000 lignes : le dashboard et les graphes CA sous-estimaient
-- le chiffre, et getStaffPerformance tirait 25-35k lignes en Node.
-- GRANT authenticated seulement ; pas d'exposition anon / PWA.

CREATE OR REPLACE FUNCTION public.get_dashboard_ca(
  p_year integer,
  p_month integer,
  p_day integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_today date := make_date(p_year, p_month, p_day);
  v_week_start date := v_today - 6;
  v_ly_today date := (v_today - interval '1 year')::date;
  v_ly_week_start date := (v_week_start - interval '1 year')::date;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  WITH days AS (
    SELECT
      d.site_id,
      d.year,
      d.month,
      d.day,
      make_date(d.year, d.month, d.day) AS dt,
      COALESCE(d.total, 0)::numeric AS total
    FROM public.data d
    WHERE d.year BETWEEN p_year - 2 AND p_year
  ),
  totals AS (
    SELECT
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year AND month = p_month AND day = p_day
      ), 0) AS today_current,
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year - 1 AND month = p_month AND day = p_day
      ), 0) AS today_previous_year,
      COALESCE(SUM(total) FILTER (
        WHERE dt BETWEEN v_week_start AND v_today
      ), 0) AS week_current,
      COALESCE(SUM(total) FILTER (
        WHERE dt BETWEEN v_ly_week_start AND v_ly_today
      ), 0) AS week_previous_year,
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year AND month = p_month AND day <= p_day
      ), 0) AS month_current,
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year - 1 AND month = p_month AND day <= p_day
      ), 0) AS month_previous_year,
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year AND dt <= v_today
      ), 0) AS year_current,
      COALESCE(SUM(total) FILTER (
        WHERE year = p_year - 1 AND dt <= v_ly_today
      ), 0) AS year_previous_year
    FROM days
  ),
  by_site AS (
    SELECT site_id, SUM(total) AS total
    FROM days
    WHERE year = p_year AND month = p_month
    GROUP BY site_id
  ),
  top5 AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('site_id', s.site_id, 'total', s.total) ORDER BY s.total DESC),
      '[]'::jsonb
    ) AS arr
    FROM (SELECT site_id, total FROM by_site ORDER BY total DESC LIMIT 5) s
  ),
  flop5 AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('site_id', s.site_id, 'total', s.total) ORDER BY s.total ASC),
      '[]'::jsonb
    ) AS arr
    FROM (SELECT site_id, total FROM by_site ORDER BY total ASC LIMIT 5) s
  )
  SELECT jsonb_build_object(
    'today', jsonb_build_object('current', t.today_current, 'previous_year', t.today_previous_year),
    'week', jsonb_build_object('current', t.week_current, 'previous_year', t.week_previous_year),
    'month', jsonb_build_object('current', t.month_current, 'previous_year', t.month_previous_year),
    'year', jsonb_build_object('current', t.year_current, 'previous_year', t.year_previous_year),
    'top_sites', top5.arr,
    'flop_sites', flop5.arr
  )
  INTO v_result
  FROM totals t, top5, flop5;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_yearly_monthly_totals(p_year integer)
RETURNS TABLE (month integer, total numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT g.mth::integer, COALESCE(SUM(d.total), 0)::numeric
  FROM generate_series(1, 12) AS g(mth)
  LEFT JOIN public.data d ON d.year = p_year AND d.month = g.mth
  GROUP BY g.mth
  ORDER BY g.mth;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_data_by_site(
  p_year integer,
  p_month integer,
  p_site_ids integer[] DEFAULT NULL
)
RETURNS TABLE (
  site_id integer,
  total numeric,
  cb numeric,
  confiserie numeric,
  enfants numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    d.site_id,
    COALESCE(SUM(d.total), 0)::numeric,
    COALESCE(SUM(d.cb), 0)::numeric,
    COALESCE(SUM(d.confiserie), 0)::numeric,
    COALESCE(SUM(d.enfants), 0)::numeric
  FROM public.data d
  WHERE d.year = p_year
    AND d.month = p_month
    AND (p_site_ids IS NULL OR d.site_id = ANY (p_site_ids))
  GROUP BY d.site_id;
END;
$$;

-- Baseline (site, jour de semaine) + indices user/site sur [p_from, p_to].
-- Constantes alignées sur staff-performance.ts : 3j min baseline, fenêtres 90/180j.
CREATE OR REPLACE FUNCTION public.get_staff_performance(p_from date, p_to date)
RETURNS TABLE (
  user_id integer,
  site_id integer,
  perf_index double precision,
  days_worked integer,
  ca numeric,
  expected_ca numeric,
  planned_days_3m integer,
  planned_days_6m integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_from_3m date := p_to - 90;
  v_from_6m date := p_to - 180;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
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
        >= (EXTRACT(YEAR FROM p_from)::integer, EXTRACT(MONTH FROM p_from)::integer, EXTRACT(DAY FROM p_from)::integer)
      AND (d.year, d.month, d.day)
        <= (EXTRACT(YEAR FROM p_to)::integer, EXTRACT(MONTH FROM p_to)::integer, EXTRACT(DAY FROM p_to)::integer)
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
        >= (EXTRACT(YEAR FROM p_from)::integer, EXTRACT(MONTH FROM p_from)::integer, EXTRACT(DAY FROM p_from)::integer)
      AND (p.year, p.month, p.day)
        <= (EXTRACT(YEAR FROM p_to)::integer, EXTRACT(MONTH FROM p_to)::integer, EXTRACT(DAY FROM p_to)::integer)
  ),
  acc AS (
    SELECT
      ps.uid AS acc_user_id,
      ps.site_id AS acc_site_id,
      COALESCE(SUM(dd.total) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ), 0) AS actual,
      COALESCE(SUM(bl.expected) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ), 0) AS expected,
      COUNT(*) FILTER (
        WHERE dd.total IS NOT NULL AND bl.expected IS NOT NULL AND bl.expected > 0
      ) AS days,
      COUNT(*) FILTER (WHERE ps.dt >= v_from_3m AND ps.dt <= p_to) AS planned_3m,
      COUNT(*) FILTER (WHERE ps.dt >= v_from_6m AND ps.dt <= p_to) AS planned_6m
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
  )
  SELECT
    a.acc_user_id,
    a.acc_site_id,
    CASE
      WHEN a.expected > 0 AND a.days > 0 THEN (a.actual / a.expected)::double precision
      ELSE NULL
    END,
    a.days::integer,
    ROUND(a.actual),
    ROUND(a.expected),
    a.planned_3m::integer,
    a.planned_6m::integer
  FROM acc a;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_ca(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_yearly_monthly_totals(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_data_by_site(integer, integer, integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_performance(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_ca(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_yearly_monthly_totals(integer) FROM anon;
REVOKE ALL ON FUNCTION public.sum_data_by_site(integer, integer, integer[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_performance(date, date) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_dashboard_ca(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_yearly_monthly_totals(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_data_by_site(integer, integer, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_performance(date, date) TO authenticated;
