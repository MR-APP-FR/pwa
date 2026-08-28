-- Check-in pannes a l'ouverture : liste des tickets ouverts + cloture terrain + message Bureau.

CREATE OR REPLACE FUNCTION public.assert_employee_on_site_mission(
  p_site_id integer,
  p_date date
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION '%', 'Compte non li' || chr(233) || ' ' || chr(224) || ' un employ' || chr(233);
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

  RETURN emp_id;
END;
$$;

COMMENT ON FUNCTION public.assert_employee_on_site_mission(integer, date) IS
  'Verifie que l employe connecte est planifie sur le site a la date donnee ; retourne son user_id.';

REVOKE ALL ON FUNCTION public.assert_employee_on_site_mission(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_employee_on_site_mission(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_employee_on_site_mission(integer, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_open_site_interventions(
  p_site_id integer,
  p_date date
)
RETURNS TABLE (
  id bigint,
  description text,
  pannes_autre text,
  sujet_ids integer[],
  sujet_names text[],
  status public.intervention_status,
  reported_at timestamptz,
  urgent boolean,
  scheduled_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_employee_on_site_mission(p_site_id, p_date);

  RETURN QUERY
  SELECT
    i.id,
    i.description,
    i.pannes_autre,
    i.sujet_ids,
    COALESCE(
      (
        SELECT array_agg(s.name ORDER BY s.name)
        FROM public.sujets AS s
        WHERE s.id = ANY (i.sujet_ids)
      ),
      '{}'::text[]
    ) AS sujet_names,
    i.status,
    i.reported_at,
    i.urgent,
    i.scheduled_at
  FROM public.intervention AS i
  WHERE i.site_id = p_site_id
    AND i.status IN ('signalee', 'planifiee')
  ORDER BY i.urgent DESC, i.reported_at ASC, i.id ASC;
END;
$$;

COMMENT ON FUNCTION public.list_open_site_interventions(integer, date) IS
  'Tickets intervention ouverts du site, visibles par le teneur planifie ce jour.';

REVOKE ALL ON FUNCTION public.list_open_site_interventions(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_open_site_interventions(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_open_site_interventions(integer, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_pannes_from_opening(
  p_site_id integer,
  p_date date,
  p_intervention_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id integer;
  resolver_label text;
  site_label text;
  teneur_name text;
  double_name text;
  resolved_at_label text;
  corps text;
  ticket_block text;
  closed_ids bigint[] := '{}'::bigint[];
  rec record;
  sujet_line text;
  status_label text;
  schedule_label text;
  ticket_count integer := 0;
BEGIN
  emp_id := public.assert_employee_on_site_mission(p_site_id, p_date);

  IF p_intervention_ids IS NULL OR cardinality(p_intervention_ids) = 0 THEN
    RETURN;
  END IF;

  resolver_label := public.employee_display_name(emp_id);
  resolved_at_label := to_char(timezone('Europe/Paris', now()), 'DD/MM/YYYY');

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
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

  corps := 'Site: ' || site_label
    || chr(10) || 'Teneur: ' || COALESCE(teneur_name, '-')
    || CASE
         WHEN double_name IS NULL THEN ''
         ELSE chr(10) || 'Double: ' || double_name
       END
    || chr(10) || 'Constat' || chr(233) || ' par: ' || COALESCE(resolver_label, '-')
    || chr(10) || 'Date r' || chr(233) || 'solution: ' || resolved_at_label;

  FOR rec IN
    SELECT
      i.id,
      i.description,
      i.pannes_autre,
      i.sujet_ids,
      i.status,
      i.reported_at,
      i.urgent,
      i.scheduled_at,
      COALESCE(
        (
          SELECT string_agg(s.name, ', ' ORDER BY s.name)
          FROM public.sujets AS s
          WHERE s.id = ANY (i.sujet_ids)
        ),
        ''
      ) AS sujet_names_line
    FROM public.intervention AS i
    WHERE i.id = ANY (p_intervention_ids)
      AND i.site_id = p_site_id
      AND i.status IN ('signalee', 'planifiee')
    ORDER BY i.id
  LOOP
    UPDATE public.intervention AS i
    SET
      status = 'cloturee',
      completed_at = now(),
      resolution_notes = 'R' || chr(233) || 'solu ' || chr(224) || ' l''ouverture PWA le '
        || resolved_at_label
        || ' par ' || COALESCE(resolver_label, 'employ' || chr(233) || ' #' || emp_id::text)
    WHERE i.id = rec.id;

    closed_ids := array_append(closed_ids, rec.id);
    ticket_count := ticket_count + 1;

    status_label := CASE rec.status
      WHEN 'planifiee' THEN 'Programm' || chr(233)
      ELSE 'Ouverte'
    END;

    schedule_label := CASE
      WHEN rec.scheduled_at IS NULL THEN NULL
      ELSE to_char(timezone('Europe/Paris', rec.scheduled_at), 'DD/MM/YYYY')
    END;

    sujet_line := CASE
      WHEN rec.sujet_names_line <> '' THEN rec.sujet_names_line
      WHEN rec.pannes_autre IS NOT NULL AND btrim(rec.pannes_autre) <> '' THEN 'Autre'
      ELSE 'Autre'
    END;

    ticket_block := chr(10) || chr(10)
      || '--- Ticket #' || rec.id::text || ' ---'
      || chr(10) || 'Sujet: ' || sujet_line
      || chr(10) || 'Description: ' || COALESCE(
           nullif(btrim(rec.pannes_autre), ''),
           nullif(btrim(rec.description), ''),
           '-'
         )
      || chr(10) || 'Signal' || chr(233) || ' le: '
        || to_char(timezone('Europe/Paris', rec.reported_at), 'DD/MM/YYYY')
      || chr(10) || 'Statut avant: ' || status_label
      || chr(10) || 'Urgent: ' || CASE WHEN rec.urgent THEN 'oui' ELSE 'non' END;

    IF schedule_label IS NOT NULL THEN
      ticket_block := ticket_block || chr(10) || 'Programm' || chr(233) || ' le: ' || schedule_label;
    END IF;

    corps := corps || ticket_block;
  END LOOP;

  IF ticket_count = 0 THEN
    RETURN;
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
    CASE
      WHEN ticket_count = 1 THEN 'Panne r' || chr(233) || 'solue'
      ELSE 'Pannes r' || chr(233) || 'solues'
    END,
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'panne_resolved',
      'site_id', p_site_id,
      'intervention_ids', closed_ids,
      'resolved_by', emp_id,
      'resolved_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_pannes_from_opening(integer, date, bigint[]) IS
  'Employe planifie : cloture des tickets intervention resolus a l ouverture + alerte canal bureau CRM.';

REVOKE ALL ON FUNCTION public.resolve_pannes_from_opening(integer, date, bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_pannes_from_opening(integer, date, bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_pannes_from_opening(integer, date, bigint[]) TO authenticated;
