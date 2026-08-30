-- Chrono ouverture : lundi uniquement. Hors borne confirmé → Bureau + intervention urgente.

COMMENT ON COLUMN public.opening_form.chrono_seconds IS
  'Durée chrono (lundi) en secondes totales (minutes × 60 + secondes). Attendu 145–155 s.';

CREATE OR REPLACE FUNCTION public.report_chrono_out_of_range(
  p_site_id integer,
  p_date date,
  p_chrono_seconds integer
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
  mins integer;
  secs integer;
  ticket_name text;
  corps text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  IF EXTRACT(ISODOW FROM p_date)::integer <> 1 THEN
    RAISE EXCEPTION 'Chrono hors borne uniquement le lundi';
  END IF;

  IF p_chrono_seconds IS NULL
     OR p_chrono_seconds < 0
     OR p_chrono_seconds > 5999 THEN
    RAISE EXCEPTION 'Chrono invalide';
  END IF;

  IF p_chrono_seconds >= 145 AND p_chrono_seconds <= 155 THEN
    RAISE EXCEPTION 'Chrono dans les bornes';
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
      AND sm.meta->>'kind' = 'chrono_miscalibrated'
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

  mins := p_chrono_seconds / 60;
  secs := p_chrono_seconds % 60;
  ticket_name := 'chrono mal calibré à ' || mins::text || 'min' || secs::text || 'sec';

  corps := 'Site: ' || site_label
    || chr(10) || 'Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || 'Chrono: ' || mins::text || ' min ' || secs::text || ' s'
    || chr(10) || 'Attendu: 2 min 25 s à 2 min 35 s'
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
    'Chrono mal calibré',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'chrono_miscalibrated',
      'site_id', p_site_id,
      'date', p_date::text,
      'chrono_seconds', p_chrono_seconds
    )
  );

  INSERT INTO public.intervention (
    site_id,
    daily_info_id,
    reported_by,
    reported_at,
    description,
    sujet_ids,
    pannes_autre,
    urgent,
    status
  ) VALUES (
    p_site_id,
    NULL,
    emp_id,
    now(),
    ticket_name,
    '{}'::integer[],
    ticket_name,
    true,
    'signalee'
  );
END;
$$;

COMMENT ON FUNCTION public.report_chrono_out_of_range(integer, date, integer) IS
  'Lundi : alerte Bureau + ticket intervention urgent si chrono hors 2 min 25–35 (2e essai).';

REVOKE ALL ON FUNCTION public.report_chrono_out_of_range(integer, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_chrono_out_of_range(integer, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_chrono_out_of_range(integer, date, integer) TO authenticated;
