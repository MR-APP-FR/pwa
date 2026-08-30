-- Carte parking : alerte Bureau si absente à l'ouverture ; photo rangée à la fermeture.

ALTER TABLE public.closing_form
  ADD COLUMN IF NOT EXISTS photo_parking_url text NULL,
  ADD COLUMN IF NOT EXISTS photo_parking_source text NULL,
  ADD COLUMN IF NOT EXISTS photo_parking_captured_at timestamptz NULL;

COMMENT ON COLUMN public.closing_form.photo_parking_url IS
  'Path Storage (bucket telecollecte-photos) — photo carte parking rangée.';
COMMENT ON COLUMN public.closing_form.photo_parking_source IS
  'Source photo parking : camera_live | phototheque.';
COMMENT ON COLUMN public.closing_form.photo_parking_captured_at IS
  'Horodatage capture photo carte parking.';

CREATE OR REPLACE FUNCTION public.report_parking_card_missing(
  p_site_id integer,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  site_label text;
  teneur_name text;
  double_name text;
  corps text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.planning AS p
    WHERE p.site_id = p_site_id
      AND p.year = EXTRACT(YEAR FROM p_date)::integer
      AND p.month = EXTRACT(MONTH FROM p_date)::integer
      AND p.day = EXTRACT(DAY FROM p_date)::integer
      AND (p.user_id = emp_id OR p.double_id = emp_id)
  ) THEN
    RAISE EXCEPTION 'Pas de mission ce jour sur ce site';
  END IF;

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message AS sm
    WHERE sm.channel = 'bureau'
      AND sm.meta->>'kind' = 'parking_card_missing'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    RETURN;
  END IF;

  SELECT
    public.employee_display_name(p.user_id),
    public.employee_display_name(p.double_id)
  INTO teneur_name, double_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  corps := 'Carte parking absente de la caisse'
    || chr(10) || 'Site: ' || site_label
    || chr(10) || 'Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || 'Teneur: ' || COALESCE(teneur_name, '-');
  IF double_name IS NOT NULL THEN
    corps := corps || chr(10) || 'Double: ' || double_name;
  END IF;

  INSERT INTO public.staff_message (
    titre,
    corps,
    source,
    channel,
    auteur_uuid,
    site_ids,
    user_ids,
    require_ack,
    meta
  ) VALUES (
    'Carte parking absente',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'parking_card_missing',
      'site_id', p_site_id,
      'date', p_date::text
    )
  );
END;
$$;

COMMENT ON FUNCTION public.report_parking_card_missing(integer, date) IS
  'Ouverture : alerte canal Bureau si carte parking absente de la caisse (idempotent site × jour).';

REVOKE ALL ON FUNCTION public.report_parking_card_missing(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_parking_card_missing(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_parking_card_missing(integer, date) TO authenticated;
