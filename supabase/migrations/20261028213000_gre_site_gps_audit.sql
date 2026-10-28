-- Audit GPS catalogue vs consensus ouvertures PWA (médiane + cluster).
-- Source : opening_form.client_lat/lng uniquement (fermeture ancrée sur l’ouverture du jour).

CREATE OR REPLACE FUNCTION public.haversine_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
    ELSE (
      6371000.0 * 2.0 * ASIN(SQRT(
        LEAST(
          1.0,
          POWER(SIN(RADIANS((lat2 - lat1) / 2.0)), 2) +
          COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
          POWER(SIN(RADIANS((lon2 - lon1) / 2.0)), 2)
        )
      ))
    )
  END;
$$;

COMMENT ON FUNCTION public.haversine_meters(double precision, double precision, double precision, double precision)
  IS 'Distance en mètres (sphère 6371 km).';

CREATE OR REPLACE FUNCTION public.get_site_gps_audit(
  p_cluster_m double precision DEFAULT 30,
  p_min_samples integer DEFAULT 5,
  p_min_cluster_ratio double precision DEFAULT 0.7,
  p_review_m double precision DEFAULT 50
)
RETURNS TABLE (
  site_id integer,
  site_name text,
  statut text,
  catalog_lat double precision,
  catalog_lng double precision,
  sample_count integer,
  cluster_count integer,
  cluster_ratio double precision,
  suggested_lat double precision,
  suggested_lng double precision,
  catalog_vs_suggested_m double precision,
  is_confident boolean,
  needs_review boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  IF p_cluster_m IS NULL OR p_cluster_m <= 0 THEN
    RAISE EXCEPTION 'p_cluster_m must be > 0';
  END IF;
  IF p_min_samples IS NULL OR p_min_samples < 1 THEN
    RAISE EXCEPTION 'p_min_samples must be >= 1';
  END IF;
  IF p_min_cluster_ratio IS NULL OR p_min_cluster_ratio <= 0 OR p_min_cluster_ratio > 1 THEN
    RAISE EXCEPTION 'p_min_cluster_ratio must be in (0, 1]';
  END IF;
  IF p_review_m IS NULL OR p_review_m < 0 THEN
    RAISE EXCEPTION 'p_review_m must be >= 0';
  END IF;

  RETURN QUERY
  WITH pts AS (
    SELECT
      oform.site_id,
      oform.client_lat::double precision AS lat,
      oform.client_lng::double precision AS lng
    FROM public.opening_form AS oform
    WHERE oform.client_lat IS NOT NULL
      AND oform.client_lng IS NOT NULL
  ),
  raw_med AS (
    SELECT
      p.site_id,
      COUNT(*)::integer AS sample_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY p.lat) AS med_lat,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY p.lng) AS med_lng
    FROM pts p
    GROUP BY p.site_id
  ),
  clustered AS (
    SELECT
      p.site_id,
      p.lat,
      p.lng,
      r.sample_count,
      r.med_lat,
      r.med_lng
    FROM pts p
    INNER JOIN raw_med r ON r.site_id = p.site_id
    WHERE public.haversine_meters(p.lat, p.lng, r.med_lat, r.med_lng) <= p_cluster_m
  ),
  sug AS (
    SELECT
      c.site_id,
      MAX(c.sample_count) AS sample_count,
      COUNT(*)::integer AS cluster_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.lat) AS suggested_lat,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.lng) AS suggested_lng
    FROM clustered c
    GROUP BY c.site_id
  )
  SELECT
    s.id AS site_id,
    s.name::text AS site_name,
    s.statut::text AS statut,
    s.latitude::double precision AS catalog_lat,
    s.longitude::double precision AS catalog_lng,
    COALESCE(g.sample_count, 0)::integer AS sample_count,
    COALESCE(g.cluster_count, 0)::integer AS cluster_count,
    CASE
      WHEN COALESCE(g.sample_count, 0) = 0 THEN NULL
      ELSE ROUND((g.cluster_count::numeric / g.sample_count::numeric), 3)::double precision
    END AS cluster_ratio,
    g.suggested_lat,
    g.suggested_lng,
    CASE
      WHEN g.suggested_lat IS NULL
        OR s.latitude IS NULL
        OR s.longitude IS NULL
      THEN NULL
      ELSE ROUND(
        public.haversine_meters(
          s.latitude::double precision,
          s.longitude::double precision,
          g.suggested_lat,
          g.suggested_lng
        )::numeric,
        1
      )::double precision
    END AS catalog_vs_suggested_m,
    (
      COALESCE(g.sample_count, 0) >= p_min_samples
      AND g.suggested_lat IS NOT NULL
      AND (g.cluster_count::numeric / NULLIF(g.sample_count, 0)::numeric) >= p_min_cluster_ratio
    ) AS is_confident,
    (
      COALESCE(g.sample_count, 0) >= p_min_samples
      AND g.suggested_lat IS NOT NULL
      AND (g.cluster_count::numeric / NULLIF(g.sample_count, 0)::numeric) >= p_min_cluster_ratio
      AND (
        s.latitude IS NULL
        OR s.longitude IS NULL
        OR public.haversine_meters(
          s.latitude::double precision,
          s.longitude::double precision,
          g.suggested_lat,
          g.suggested_lng
        ) > p_review_m
      )
    ) AS needs_review
  FROM public.site s
  LEFT JOIN sug g ON g.site_id = s.id
  WHERE COALESCE(g.sample_count, 0) > 0
     OR s.latitude IS NULL
     OR s.longitude IS NULL
  ORDER BY
    CASE
      WHEN (
        COALESCE(g.sample_count, 0) >= p_min_samples
        AND g.suggested_lat IS NOT NULL
        AND (g.cluster_count::numeric / NULLIF(g.sample_count, 0)::numeric) >= p_min_cluster_ratio
        AND (
          s.latitude IS NULL
          OR s.longitude IS NULL
          OR public.haversine_meters(
            s.latitude::double precision,
            s.longitude::double precision,
            g.suggested_lat,
            g.suggested_lng
          ) > p_review_m
        )
      ) THEN 0
      ELSE 1
    END,
    COALESCE(
      public.haversine_meters(
        s.latitude::double precision,
        s.longitude::double precision,
        g.suggested_lat,
        g.suggested_lng
      ),
      0
    ) DESC,
    s.name;
END;
$$;

COMMENT ON FUNCTION public.get_site_gps_audit(double precision, integer, double precision, double precision)
  IS 'CRM admin : consensus GPS depuis opening_form (médiane puis cluster ≤ p_cluster_m). Apply manuel via update site.';

GRANT EXECUTE ON FUNCTION public.haversine_meters(double precision, double precision, double precision, double precision)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_gps_audit(double precision, integer, double precision, double precision)
  TO authenticated;
