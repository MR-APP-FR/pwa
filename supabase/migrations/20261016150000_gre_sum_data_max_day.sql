-- CA Mois « à date » : bornage optionnel au jour J (mois en cours vs mois entier N-1).

DROP FUNCTION IF EXISTS public.sum_data_by_site_month(integer[], integer[]);
DROP FUNCTION IF EXISTS public.sum_data_by_site_month(integer[], integer[], integer);
DROP FUNCTION IF EXISTS public.sum_data_month_totals(integer, integer[]);
DROP FUNCTION IF EXISTS public.sum_data_month_totals(integer, integer[], integer);

CREATE OR REPLACE FUNCTION public.sum_data_by_site_month(
  p_years integer[],
  p_site_ids integer[] DEFAULT NULL,
  p_max_day integer DEFAULT NULL
)
RETURNS TABLE (
  site_id integer,
  year integer,
  month integer,
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
    d.year,
    d.month,
    COALESCE(SUM(d.total), 0)::numeric,
    COALESCE(SUM(d.cb), 0)::numeric,
    COALESCE(SUM(d.confiserie), 0)::numeric,
    COALESCE(SUM(d.enfants), 0)::numeric
  FROM public.data d
  WHERE d.year = ANY (p_years)
    AND (p_site_ids IS NULL OR d.site_id = ANY (p_site_ids))
    AND (p_max_day IS NULL OR d.day <= p_max_day)
  GROUP BY d.site_id, d.year, d.month
  ORDER BY d.year, d.month, d.site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_data_month_totals(
  p_year integer,
  p_months integer[],
  p_max_day integer DEFAULT NULL
)
RETURNS TABLE (
  year integer,
  month integer,
  total numeric
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
    d.year,
    d.month,
    COALESCE(SUM(d.total), 0)::numeric
  FROM public.data d
  WHERE d.year = p_year
    AND d.month = ANY (p_months)
    AND (p_max_day IS NULL OR d.day <= p_max_day)
  GROUP BY d.year, d.month;
END;
$$;

REVOKE ALL ON FUNCTION public.sum_data_by_site_month(integer[], integer[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_data_by_site_month(integer[], integer[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.sum_data_by_site_month(integer[], integer[], integer) TO authenticated;

REVOKE ALL ON FUNCTION public.sum_data_month_totals(integer, integer[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_data_month_totals(integer, integer[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.sum_data_month_totals(integer, integer[], integer) TO authenticated;
