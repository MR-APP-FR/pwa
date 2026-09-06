-- Canaux Messages CRM : bureau | ca (ex cr_auto) | inter + staff.
-- Province inchangé en DB ; Paris Nord ajouté si absent.
-- Alertes pannes → canal inter. Bucket ca-reports + cron PDF 21h Paris.

-- ---------------------------------------------------------------------------
-- 1. Channels: migrate cr_auto → ca, add inter
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.staff_message_cr_auto_monthly_decl_month;

UPDATE public.staff_message
SET channel = 'ca'
WHERE channel = 'cr_auto';

ALTER TABLE public.staff_message
  DROP CONSTRAINT IF EXISTS staff_message_channel_check;

ALTER TABLE public.staff_message
  ADD CONSTRAINT staff_message_channel_check
  CHECK (channel IN ('staff', 'bureau', 'ca', 'inter'));

COMMENT ON COLUMN public.staff_message.channel IS
  'staff = employés ciblés ; bureau / ca / inter = canaux internes CRM (is_admin uniquement).';

CREATE UNIQUE INDEX IF NOT EXISTS staff_message_ca_monthly_decl_month
  ON public.staff_message (
    (date_trunc('month', timezone('Europe/Paris', publie_at)))
  )
  WHERE channel = 'ca'
    AND source = 'appli'
    AND titre = 'Taux de déclaration';

CREATE UNIQUE INDEX IF NOT EXISTS staff_message_ca_daily_pdf_day
  ON public.staff_message (
    ((meta ->> 'date')),
    ((meta ->> 'kind'))
  )
  WHERE channel = 'ca'
    AND source = 'appli'
    AND meta ->> 'kind' = 'ca_daily_pdf';

-- ---------------------------------------------------------------------------
-- 2. Paris Nord groupe (si absent)
-- ---------------------------------------------------------------------------

INSERT INTO public.groupe (name)
SELECT 'Paris Nord'
WHERE NOT EXISTS (
  SELECT 1 FROM public.groupe g WHERE g.name = 'Paris Nord'
);

-- ---------------------------------------------------------------------------
-- 3. post_cr_auto_monthly → canal ca
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal.post_cr_auto_monthly(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_year integer := EXTRACT(YEAR FROM v_today)::integer;
  v_month integer := EXTRACT(MONTH FROM v_today)::integer;
  v_planned integer;
  v_declared integer;
  v_pct integer;
  v_corps text;
  v_vendeurs text;
  v_sont text;
BEGIN
  IF NOT p_force THEN
    IF EXTRACT(DAY FROM v_today)::integer <> 1 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'not_first');
    END IF;
    IF v_hour < 8 OR v_hour > 10 THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', 'wrong_hour', 'hour', v_hour);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message sm
    WHERE sm.channel = 'ca'
      AND sm.source = 'appli'
      AND sm.titre = 'Taux de déclaration'
      AND date_trunc('month', timezone('Europe/Paris', sm.publie_at))
          = date_trunc('month', v_today::timestamp)
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'already_this_month');
  END IF;

  WITH ids AS (
    SELECT DISTINCT uid
    FROM (
      SELECT user_id AS uid
      FROM public.planning
      WHERE year = v_year AND month = v_month AND user_id IS NOT NULL AND user_id > 0
      UNION
      SELECT double_id
      FROM public.planning
      WHERE year = v_year AND month = v_month AND double_id IS NOT NULL AND double_id > 0
    ) s
  )
  SELECT
    (SELECT count(*)::integer FROM ids),
    (
      SELECT count(*)::integer
      FROM ids i
      LEFT JOIN public.user_info ui ON ui.user_id = i.uid
      WHERE ui.onoff IS DISTINCT FROM false
    )
  INTO v_planned, v_declared;

  IF coalesce(v_planned, 0) = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'no_planning', 'planned', 0, 'declared', 0);
  END IF;

  v_pct := round((v_declared::numeric / v_planned::numeric) * 100)::integer;
  v_vendeurs := CASE WHEN v_planned = 1 THEN 'vendeur actif' ELSE 'vendeurs actifs' END;
  v_sont := CASE WHEN v_declared = 1 THEN 'est déclaré' ELSE 'sont déclarés' END;
  v_corps := format(
    'Ce mois-ci, sur %s %s, %s %s, soit %s %%. Pourrions-nous en déclarer certains autres ?',
    v_planned, v_vendeurs, v_declared, v_sont, v_pct
  );

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      'Taux de déclaration', v_corps, 'appli', 'ca', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_this_month',
      'planned', v_planned,
      'declared', v_declared
    );
  END;

  RETURN jsonb_build_object('inserted', true, 'planned', v_planned, 'declared', v_declared);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. resolve_pannes → canal inter
-- ---------------------------------------------------------------------------

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
    'inter',
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
  'Employe planifie : cloture tickets intervention a l ouverture + alerte canal Inter CRM.';

-- ---------------------------------------------------------------------------
-- 5. Nouvelle panne → message Inter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_inter_panne_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  site_label text;
  reporter_label text;
  sujet_line text;
  corps text;
BEGIN
  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = NEW.site_id;

  reporter_label := public.employee_display_name(NEW.reported_by);

  SELECT COALESCE(
    (
      SELECT string_agg(s.name, ', ' ORDER BY s.name)
      FROM public.sujets AS s
      WHERE s.id = ANY (NEW.sujet_ids)
    ),
    ''
  ) INTO sujet_line;

  IF sujet_line = '' THEN
    sujet_line := CASE
      WHEN NEW.pannes_autre IS NOT NULL AND btrim(NEW.pannes_autre) <> '' THEN 'Autre'
      ELSE 'Autre'
    END;
  END IF;

  corps := 'Site: ' || COALESCE(site_label, '-')
    || chr(10) || 'Signal' || chr(233) || ' par: ' || COALESCE(reporter_label, '-')
    || chr(10) || 'Sujet: ' || sujet_line
    || chr(10) || 'Description: ' || COALESCE(
         nullif(btrim(NEW.pannes_autre), ''),
         nullif(btrim(NEW.description), ''),
         '-'
       )
    || chr(10) || 'Urgent: ' || CASE WHEN NEW.urgent THEN 'oui' ELSE 'non' END
    || chr(10) || 'Ticket #' || NEW.id::text;

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
    CASE WHEN NEW.urgent THEN 'Panne urgente' ELSE 'Nouvelle panne' END,
    corps,
    'appli',
    'inter',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'panne_created',
      'site_id', NEW.site_id,
      'intervention_id', NEW.id,
      'urgent', NEW.urgent,
      'reported_by', NEW.reported_by
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_inter_panne_created() IS
  'Après insert intervention : message canal Inter CRM.';

DROP TRIGGER IF EXISTS trg_notify_inter_panne_created ON public.intervention;
CREATE TRIGGER trg_notify_inter_panne_created
  AFTER INSERT ON public.intervention
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inter_panne_created();

-- ---------------------------------------------------------------------------
-- 6. Storage bucket ca-reports
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('ca-reports', 'ca-reports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "ca-reports admin all" ON storage.objects;
CREATE POLICY "ca-reports admin all" ON storage.objects
  FOR ALL USING (bucket_id = 'ca-reports' AND is_admin())
  WITH CHECK (bucket_id = 'ca-reports' AND is_admin());

-- ---------------------------------------------------------------------------
-- 7. pg_cron PDF CA 21h Paris (Edge ca-daily-pdf) — dual UTC 19h + 20h
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ca-daily-pdf-utc19') THEN
    PERFORM cron.unschedule('ca-daily-pdf-utc19');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ca-daily-pdf-utc20') THEN
    PERFORM cron.unschedule('ca-daily-pdf-utc20');
  END IF;
END $$;

SELECT cron.schedule(
  'ca-daily-pdf-utc19',
  '0 19 * * *',
  $$SELECT internal.invoke_edge('ca-daily-pdf');$$
);

SELECT cron.schedule(
  'ca-daily-pdf-utc20',
  '0 20 * * *',
  $$SELECT internal.invoke_edge('ca-daily-pdf');$$
);
