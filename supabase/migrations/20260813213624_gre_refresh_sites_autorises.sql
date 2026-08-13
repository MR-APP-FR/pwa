-- Recalcule user_info_sites = sites où le staff a déjà travaillé (planning passé).
-- Déclenché depuis le CRM planning si le dernier run date de plus de 7 jours.

CREATE TABLE IF NOT EXISTS public.ops_job (
  name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL
);

ALTER TABLE public.ops_job ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.maybe_refresh_user_info_sites_from_planning()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_last timestamptz;
  v_deleted integer;
  v_inserted integer;
BEGIN
  SELECT last_run_at INTO v_last
  FROM public.ops_job
  WHERE name = 'refresh_user_info_sites';

  IF v_last IS NOT NULL AND v_last > now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'refreshed', false,
      'last_run_at', v_last
    );
  END IF;

  WITH worked AS (
    SELECT DISTINCT ui.id AS user_info_id, p.site_id
    FROM public.planning p
    JOIN public.user_info ui ON ui.user_id = p.user_id
    JOIN public.site s ON s.id = p.site_id
    WHERE p.user_id IS NOT NULL
      AND make_date(p.year, p.month, p.day) <= (timezone('Europe/Paris', now()))::date
    UNION
    SELECT DISTINCT ui.id, p.site_id
    FROM public.planning p
    JOIN public.user_info ui ON ui.user_id = p.double_id
    JOIN public.site s ON s.id = p.site_id
    WHERE p.double_id IS NOT NULL
      AND make_date(p.year, p.month, p.day) <= (timezone('Europe/Paris', now()))::date
  ),
  deleted AS (
    DELETE FROM public.user_info_sites uis
    WHERE NOT EXISTS (
      SELECT 1
      FROM worked w
      WHERE w.user_info_id = uis.user_info_id
        AND w.site_id = uis.site_id
    )
    RETURNING 1
  ),
  inserted AS (
    INSERT INTO public.user_info_sites (user_info_id, site_id)
    SELECT w.user_info_id, w.site_id
    FROM worked w
    ON CONFLICT (user_info_id, site_id) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::integer FROM deleted),
    (SELECT count(*)::integer FROM inserted)
  INTO v_deleted, v_inserted;

  INSERT INTO public.ops_job (name, last_run_at)
  VALUES ('refresh_user_info_sites', now())
  ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at;

  RETURN jsonb_build_object(
    'refreshed', true,
    'deleted', v_deleted,
    'inserted', v_inserted,
    'last_run_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.maybe_refresh_user_info_sites_from_planning() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maybe_refresh_user_info_sites_from_planning() FROM anon;
REVOKE ALL ON FUNCTION public.maybe_refresh_user_info_sites_from_planning() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.maybe_refresh_user_info_sites_from_planning() TO service_role;
