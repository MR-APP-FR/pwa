-- 2S = semaine en cours + semaine précédente (lundi→dimanche), y compris
-- les jours déjà planifiés plus tard cette semaine.
-- Étend le planning lu jusqu'au dimanche pour ce compteur.
-- Recharge le cache PostgREST (nouvelle colonne planned_days_2w).

CREATE OR REPLACE FUNCTION public.get_staff_performance(p_from date, p_to date)
RETURNS TABLE (
  user_id integer,
  site_id integer,
  perf_index double precision,
  days_worked integer,
  ca numeric,
  expected_ca numeric,
  planned_days_2w integer,
  planned_days_3m integer,
  planned_days_6m integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_week_start date := date_trunc('week', p_to::timestamp)::date;
  v_from_2w date := v_week_start - 7;
  v_to_2w date := v_week_start + 6;
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
        <= (EXTRACT(YEAR FROM v_to_2w)::integer, EXTRACT(MONTH FROM v_to_2w)::integer, EXTRACT(DAY FROM v_to_2w)::integer)
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
      COUNT(*) FILTER (WHERE ps.dt >= v_from_2w AND ps.dt <= v_to_2w) AS planned_2w,
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
    a.planned_2w::integer,
    a.planned_3m::integer,
    a.planned_6m::integer
  FROM acc a;
END;
$$;

NOTIFY pgrst, 'reload schema';
