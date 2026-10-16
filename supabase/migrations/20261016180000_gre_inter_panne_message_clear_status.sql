-- Messages canal Inter : titre = statut unique (signalée vs résolue), sans doublon corps.
-- Avant : titre « ⚠️ Panne » + corps « ✅ Panne résolue » → les deux s'affichaient.

-- ---------------------------------------------------------------------------
-- Nouvelle panne : corps = champs seulement (titre porte déjà ⚠️ / urgente)
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
  pad integer := 11;
  desc_text text;
BEGIN
  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = NEW.site_id;

  reporter_label := public.employee_bureau_short_name(NEW.reported_by);

  SELECT COALESCE(
    (
      SELECT string_agg(s.name, ', ' ORDER BY s.name)
      FROM public.sujets AS s
      WHERE s.id = ANY (NEW.sujet_ids)
    ),
    ''
  ) INTO sujet_line;

  IF sujet_line = '' THEN
    sujet_line := 'Autre';
  END IF;

  desc_text := COALESCE(
    nullif(btrim(NEW.pannes_autre), ''),
    nullif(btrim(NEW.description), ''),
    '-'
  );

  corps := public.bureau_msg_line('📍', 'Site', upper(COALESCE(site_label, '-')), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Signalé par', COALESCE(reporter_label, '-'), pad)
    || chr(10) || public.bureau_msg_line('📅', 'Date', to_char(timezone('Europe/Paris', NEW.reported_at), 'DD/MM/YYYY'), pad)
    || chr(10) || public.bureau_msg_line('💬', 'Sujet', sujet_line, pad)
    || chr(10) || public.bureau_msg_line('📝', 'Description', desc_text, pad)
    || chr(10) || public.bureau_msg_line('🎫', 'Ticket', '#' || NEW.id::text, pad);

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    CASE WHEN NEW.urgent THEN '⚠️ Panne urgente' ELSE '⚠️ Panne' END,
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

-- ---------------------------------------------------------------------------
-- Panne(s) résolue(s) : titre ✅ (plus ⚠️), corps sans ligne de statut dupliquée
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
  resolved_at_label text;
  corps text;
  ticket_block text;
  closed_ids bigint[] := '{}'::bigint[];
  rec record;
  sujet_line text;
  status_label text;
  schedule_label text;
  ticket_count integer := 0;
  pad integer := 14; -- « Date résolution »
BEGIN
  emp_id := public.assert_employee_on_site_mission(p_site_id, p_date);

  IF p_intervention_ids IS NULL OR cardinality(p_intervention_ids) = 0 THEN
    RETURN;
  END IF;

  resolver_label := public.employee_bureau_short_name(emp_id);
  resolved_at_label := to_char(timezone('Europe/Paris', now()), 'DD/MM/YYYY');

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = p_site_id;
  IF site_label IS NULL THEN
    RAISE EXCEPTION 'Site introuvable';
  END IF;

  SELECT public.employee_bureau_short_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  corps := public.bureau_msg_line('📍', 'Site', upper(COALESCE(site_label, '-')), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Teneur', COALESCE(teneur_name, '-'), pad)
    || chr(10) || public.bureau_msg_line('👤', 'Constaté par', COALESCE(resolver_label, '-'), pad)
    || chr(10) || public.bureau_msg_line('📅', 'Date résolution', resolved_at_label, pad);

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
      resolution_notes = 'Résolu à l''ouverture PWA le '
        || resolved_at_label
        || ' par ' || COALESCE(resolver_label, 'employé #' || emp_id::text)
    WHERE i.id = rec.id;

    closed_ids := array_append(closed_ids, rec.id);
    ticket_count := ticket_count + 1;

    status_label := CASE rec.status
      WHEN 'planifiee' THEN 'Programmé'
      ELSE 'Ouverte'
    END;

    schedule_label := CASE
      WHEN rec.scheduled_at IS NULL THEN NULL
      ELSE to_char(timezone('Europe/Paris', rec.scheduled_at), 'DD/MM/YYYY')
    END;

    sujet_line := CASE
      WHEN rec.sujet_names_line <> '' THEN rec.sujet_names_line
      ELSE 'Autre'
    END;

    ticket_block := chr(10) || chr(10)
      || '🎫 Ticket #' || rec.id::text
      || chr(10) || public.bureau_msg_line('💬', 'Sujet', sujet_line, pad)
      || chr(10) || public.bureau_msg_line(
           '📝',
           'Description',
           COALESCE(
             nullif(btrim(rec.pannes_autre), ''),
             nullif(btrim(rec.description), ''),
             '-'
           ),
           pad
         )
      || chr(10) || public.bureau_msg_line(
           '📅',
           'Signalé le',
           to_char(timezone('Europe/Paris', rec.reported_at), 'DD/MM/YYYY'),
           pad
         )
      || chr(10) || public.bureau_msg_line('📌', 'Statut avant', status_label, pad)
      || chr(10) || public.bureau_msg_line(
           '🚨', 'Urgent', CASE WHEN rec.urgent THEN 'oui' ELSE 'non' END, pad
         );

    IF schedule_label IS NOT NULL THEN
      ticket_block := ticket_block
        || chr(10) || public.bureau_msg_line('🗓️', 'Programmé le', schedule_label, pad);
    END IF;

    corps := corps || ticket_block;
  END LOOP;

  IF ticket_count = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    CASE
      WHEN ticket_count = 1 THEN '✅ Panne résolue'
      ELSE '✅ Pannes résolues'
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

-- ---------------------------------------------------------------------------
-- Backfill messages existants
-- ---------------------------------------------------------------------------

-- Résolues : titre ✅ + retirer la ligne de statut en tête de corps
UPDATE public.staff_message AS sm
SET
  titre = CASE
    WHEN sm.corps ~ '^✅[[:space:]]*Pannes résolues'
      OR sm.titre IN ('⚠️ Pannes', 'Pannes résolues')
      THEN '✅ Pannes résolues'
    ELSE '✅ Panne résolue'
  END,
  corps = regexp_replace(
    sm.corps,
    '^✅[[:space:]]*Pannes? résolue[s]?[[:space:]]*' || chr(10) || '?',
    ''
  )
WHERE sm.source = 'appli'
  AND sm.channel = 'inter'
  AND (
    sm.meta->>'kind' = 'panne_resolved'
    OR sm.corps ~ '^✅[[:space:]]*Pannes? résolue'
    OR sm.titre IN ('Panne résolue', 'Pannes résolues')
  );

-- Créées : retirer « 🔧 Nouvelle panne » / « 🚨 Panne urgente » en tête (déjà dans titre)
UPDATE public.staff_message AS sm
SET corps = regexp_replace(
  sm.corps,
  '^(🔧[[:space:]]*Nouvelle panne|🚨[[:space:]]*Panne urgente)[[:space:]]*' || chr(10) || '?',
  ''
)
WHERE sm.source = 'appli'
  AND sm.channel = 'inter'
  AND (
    sm.meta->>'kind' = 'panne_created'
    OR sm.corps ~ '^(🔧[[:space:]]*Nouvelle panne|🚨[[:space:]]*Panne urgente)'
  );
