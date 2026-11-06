-- Annuaire planning lecture seule pour techniciens (maintenance).
-- Expose site × jour × teneur/double + téléphone, sans ouvrir user_info en RLS.

CREATE OR REPLACE FUNCTION public.get_tech_planning_directory(
  p_from date,
  p_to date
)
RETURNS TABLE (
  day date,
  site_id integer,
  site_name text,
  group_id integer,
  group_name text,
  closed boolean,
  staff_role text,
  user_id integer,
  display_name text,
  telephone text,
  couleur text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_maintenance_employee() THEN
    RAISE EXCEPTION 'maintenance required' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to required';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must be >= p_from';
  END IF;

  IF (p_to - p_from) > 31 THEN
    RAISE EXCEPTION 'range must be <= 31 days';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT p_from AS d_from, p_to AS d_to
  ),
  rows AS (
    SELECT
      make_date(p.year, p.month, p.day) AS day,
      p.site_id,
      s.name AS site_name,
      s.group_id AS group_id,
      g.name AS group_name,
      p.closed,
      p.user_id AS teneur_id,
      p.double_id
    FROM public.planning p
    JOIN public.site s ON s.id = p.site_id
    LEFT JOIN public.groupe g ON g.id = s.group_id
    CROSS JOIN bounds b
    WHERE make_date(p.year, p.month, p.day) BETWEEN b.d_from AND b.d_to
      AND (s.statut IS NULL OR s.statut = 'actif')
  ),
  staff AS (
    SELECT
      r.day,
      r.site_id,
      r.site_name,
      r.group_id,
      r.group_name,
      r.closed,
      'teneur'::text AS staff_role,
      r.teneur_id AS user_id
    FROM rows r
    WHERE r.teneur_id IS NOT NULL
      AND r.closed IS NOT TRUE

    UNION ALL

    SELECT
      r.day,
      r.site_id,
      r.site_name,
      r.group_id,
      r.group_name,
      r.closed,
      'double'::text AS staff_role,
      r.double_id AS user_id
    FROM rows r
    WHERE r.double_id IS NOT NULL
      AND r.closed IS NOT TRUE

    UNION ALL

    -- Sites fermés : une ligne sans staff pour afficher « Fermé »
    SELECT
      r.day,
      r.site_id,
      r.site_name,
      r.group_id,
      r.group_name,
      r.closed,
      NULL::text AS staff_role,
      NULL::integer AS user_id
    FROM rows r
    WHERE r.closed IS TRUE
  )
  SELECT
    st.day,
    st.site_id,
    st.site_name,
    st.group_id,
    COALESCE(st.group_name, 'Sans zone') AS group_name,
    st.closed,
    st.staff_role,
    st.user_id,
    CASE
      WHEN st.user_id IS NULL THEN NULL
      ELSE COALESCE(
        NULLIF(TRIM(COALESCE(ui.first_name, '') || ' ' || COALESCE(ui.last_name, '')), ''),
        NULLIF(TRIM(u.fullname), ''),
        'Sans nom'
      )
    END AS display_name,
    NULLIF(TRIM(ui.telephone), '') AS telephone,
    NULLIF(TRIM(ui.couleur), '') AS couleur
  FROM staff st
  LEFT JOIN public."user" u ON u.id = st.user_id
  LEFT JOIN public.user_info ui ON ui.user_id = st.user_id
  ORDER BY st.day, st.group_name NULLS LAST, st.site_name, st.staff_role NULLS FIRST;
END;
$$;

COMMENT ON FUNCTION public.get_tech_planning_directory(date, date) IS
  'Annuaire planning lecture (tech maintenance) : site/jour/teneur+tél. SECURITY DEFINER, gate is_maintenance_employee().';

REVOKE ALL ON FUNCTION public.get_tech_planning_directory(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tech_planning_directory(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tech_planning_directory(date, date) TO authenticated;
