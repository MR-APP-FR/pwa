-- Agrégats CA mensuels depuis `data` (source unique, plus de cache `stats` côté lecture).
-- Remplace les lectures hybrides stats + isComputed.

CREATE OR REPLACE FUNCTION public.sum_data_by_site_month(
  p_years integer[],
  p_site_ids integer[] DEFAULT NULL
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
  GROUP BY d.site_id, d.year, d.month
  ORDER BY d.year, d.month, d.site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_data_month_totals(
  p_year integer,
  p_months integer[]
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
  GROUP BY d.year, d.month;
END;
$$;

REVOKE ALL ON FUNCTION public.sum_data_by_site_month(integer[], integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_data_by_site_month(integer[], integer[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.sum_data_by_site_month(integer[], integer[]) TO authenticated;

REVOKE ALL ON FUNCTION public.sum_data_month_totals(integer, integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_data_month_totals(integer, integer[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.sum_data_month_totals(integer, integer[]) TO authenticated;
