-- FSM interventions : multi-visites, chrono, pièces, médias, timeline.
-- 1 ticket ouvert jusqu'à cloturee ; retours / pièces = nouvelles visites.
-- Enum values en_cours / en_pause / en_attente : migration gre_intervention_fsm_v2_enum.

-- ---------------------------------------------------------------------------
-- Colonnes ticket
-- ---------------------------------------------------------------------------
ALTER TABLE public.intervention
  ADD COLUMN IF NOT EXISTS hold_reason text
    CHECK (hold_reason IS NULL OR hold_reason IN ('pieces', 'retour', 'autre')),
  ADD COLUMN IF NOT EXISTS active_visit_id bigint;

COMMENT ON COLUMN public.intervention.hold_reason IS
  'Motif en_attente : pieces | retour | autre.';
COMMENT ON COLUMN public.intervention.active_visit_id IS
  'Visite terrain en cours (en_cours / en_pause), sinon null.';

-- ---------------------------------------------------------------------------
-- Visites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intervention_visit (
  id bigserial PRIMARY KEY,
  intervention_id bigint NOT NULL REFERENCES public.intervention(id) ON DELETE CASCADE,
  tech_user_id integer NOT NULL REFERENCES public."user"(id),
  scheduled_date date,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  outcome text CHECK (
    outcome IS NULL
    OR outcome IN ('termine', 'a_replanifier', 'attente_pieces')
  ),
  pause_seconds integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intervention_visit_intervention_id_idx
  ON public.intervention_visit (intervention_id, started_at DESC);
CREATE INDEX IF NOT EXISTS intervention_visit_tech_open_idx
  ON public.intervention_visit (tech_user_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE public.intervention_visit IS
  'Présence terrain sur un ticket (plusieurs visites possibles).';

-- FK active_visit_id après création de la table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_active_visit_fk'
  ) THEN
    ALTER TABLE public.intervention
      ADD CONSTRAINT intervention_active_visit_fk
      FOREIGN KEY (active_visit_id)
      REFERENCES public.intervention_visit(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Segments chrono
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intervention_time_segment (
  id bigserial PRIMARY KEY,
  visit_id bigint NOT NULL REFERENCES public.intervention_visit(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS intervention_time_segment_visit_idx
  ON public.intervention_time_segment (visit_id, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS intervention_time_segment_one_open
  ON public.intervention_time_segment (visit_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE public.intervention_time_segment IS
  'Segments start→pause du chrono d''une visite.';

-- ---------------------------------------------------------------------------
-- Timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intervention_event (
  id bigserial PRIMARY KEY,
  intervention_id bigint NOT NULL REFERENCES public.intervention(id) ON DELETE CASCADE,
  visit_id bigint REFERENCES public.intervention_visit(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES public."user"(id),
  kind text NOT NULL CHECK (
    kind IN (
      'created', 'scheduled', 'started', 'paused', 'resumed',
      'rescheduled', 'comment', 'media', 'part', 'hold',
      'completed', 'reopened'
    )
  ),
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intervention_event_intervention_id_idx
  ON public.intervention_event (intervention_id, created_at DESC);

COMMENT ON TABLE public.intervention_event IS
  'Timeline structurée d''un ticket intervention.';

-- ---------------------------------------------------------------------------
-- Pièces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intervention_part (
  id bigserial PRIMARY KEY,
  intervention_id bigint NOT NULL REFERENCES public.intervention(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'a_commander'
    CHECK (status IN ('a_commander', 'commande', 'recu')),
  ordered_at timestamptz,
  received_at timestamptz,
  ref text,
  note text,
  created_by integer REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intervention_part_intervention_id_idx
  ON public.intervention_part (intervention_id, created_at);

COMMENT ON TABLE public.intervention_part IS
  'Pièces à commander / commandées / reçues pour résoudre le ticket.';

-- ---------------------------------------------------------------------------
-- Médias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intervention_media (
  id bigserial PRIMARY KEY,
  intervention_id bigint NOT NULL REFERENCES public.intervention(id) ON DELETE CASCADE,
  visit_id bigint REFERENCES public.intervention_visit(id) ON DELETE SET NULL,
  event_id bigint REFERENCES public.intervention_event(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('photo', 'video')),
  storage_path text NOT NULL,
  mime text,
  created_by integer REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intervention_media_intervention_id_idx
  ON public.intervention_media (intervention_id, created_at DESC);

COMMENT ON TABLE public.intervention_media IS
  'Photos / vidéos (path bucket intervention-media).';

-- ---------------------------------------------------------------------------
-- RLS child tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.intervention_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_time_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_media ENABLE ROW LEVEL SECURITY;

-- Helper: peut lire le ticket parent
CREATE OR REPLACE FUNCTION public.can_access_intervention(p_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.intervention i
    WHERE i.id = p_id
      AND (
        (SELECT public.is_admin())
        OR i.reported_by = (SELECT public.current_employee_id())
        OR i.assignee_user_id = (SELECT public.current_employee_id())
        OR (SELECT public.is_maintenance_employee())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_intervention(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_intervention(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_intervention(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_mutate_intervention(p_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.intervention i
    WHERE i.id = p_id
      AND (
        (SELECT public.is_admin())
        OR i.assignee_user_id = (SELECT public.current_employee_id())
        OR (SELECT public.is_maintenance_employee())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_mutate_intervention(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_mutate_intervention(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_mutate_intervention(bigint) TO authenticated;

-- visit
DROP POLICY IF EXISTS "intervention_visit select" ON public.intervention_visit;
CREATE POLICY "intervention_visit select" ON public.intervention_visit
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_intervention(intervention_id)));

DROP POLICY IF EXISTS "intervention_visit write" ON public.intervention_visit;
CREATE POLICY "intervention_visit write" ON public.intervention_visit
  FOR ALL TO authenticated
  USING ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()));

-- time_segment via visit
DROP POLICY IF EXISTS "intervention_time_segment select" ON public.intervention_time_segment;
CREATE POLICY "intervention_time_segment select" ON public.intervention_time_segment
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.intervention_visit v
      WHERE v.id = visit_id
        AND (SELECT public.can_access_intervention(v.intervention_id))
    )
  );

DROP POLICY IF EXISTS "intervention_time_segment write" ON public.intervention_time_segment;
CREATE POLICY "intervention_time_segment write" ON public.intervention_time_segment
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.intervention_visit v
      WHERE v.id = visit_id
        AND ((SELECT public.can_mutate_intervention(v.intervention_id)) OR (SELECT public.is_admin()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.intervention_visit v
      WHERE v.id = visit_id
        AND ((SELECT public.can_mutate_intervention(v.intervention_id)) OR (SELECT public.is_admin()))
    )
  );

-- event
DROP POLICY IF EXISTS "intervention_event select" ON public.intervention_event;
CREATE POLICY "intervention_event select" ON public.intervention_event
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_intervention(intervention_id)));

DROP POLICY IF EXISTS "intervention_event write" ON public.intervention_event;
CREATE POLICY "intervention_event write" ON public.intervention_event
  FOR ALL TO authenticated
  USING ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()));

-- part
DROP POLICY IF EXISTS "intervention_part select" ON public.intervention_part;
CREATE POLICY "intervention_part select" ON public.intervention_part
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_intervention(intervention_id)));

DROP POLICY IF EXISTS "intervention_part write" ON public.intervention_part;
CREATE POLICY "intervention_part write" ON public.intervention_part
  FOR ALL TO authenticated
  USING ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()));

-- media
DROP POLICY IF EXISTS "intervention_media select" ON public.intervention_media;
CREATE POLICY "intervention_media select" ON public.intervention_media
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_intervention(intervention_id)));

DROP POLICY IF EXISTS "intervention_media write" ON public.intervention_media;
CREATE POLICY "intervention_media write" ON public.intervention_media
  FOR ALL TO authenticated
  USING ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT public.can_mutate_intervention(intervention_id)) OR (SELECT public.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_visit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_time_segment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_event TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_part TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_media TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.intervention_visit_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.intervention_time_segment_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.intervention_event_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.intervention_part_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.intervention_media_id_seq TO authenticated;

-- Maintenance peut créer des tickets
DROP POLICY IF EXISTS "intervention insert maintenance_or_admin" ON public.intervention;
CREATE POLICY "intervention insert maintenance_or_admin" ON public.intervention
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    OR (
      (SELECT public.is_maintenance_employee())
      AND reported_by = (SELECT public.current_employee_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('intervention-media', 'intervention-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "intervention-media admin all" ON storage.objects;
CREATE POLICY "intervention-media admin all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'intervention-media' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'intervention-media' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "intervention-media maintenance readwrite" ON storage.objects;
CREATE POLICY "intervention-media maintenance readwrite"
  ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'intervention-media'
    AND (
      (SELECT public.is_admin())
      OR (SELECT public.is_maintenance_employee())
    )
  )
  WITH CHECK (
    bucket_id = 'intervention-media'
    AND (
      (SELECT public.is_admin())
      OR (SELECT public.is_maintenance_employee())
    )
  );

-- ---------------------------------------------------------------------------
-- Trigger panne : open statuses étendus + event created
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_intervention_from_panne()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
DECLARE
  panne_text text;
  has_sujets boolean;
  has_autre boolean;
  sid integer;
  sujet_name text;
  ticket_text text;
  line text;
  reason text;
  existing_id bigint;
  existing_description text;
  new_id bigint;
  open_statuses public.intervention_status[] := ARRAY[
    'signalee'::public.intervention_status,
    'a_planifier'::public.intervention_status,
    'planifiee'::public.intervention_status,
    'en_cours'::public.intervention_status,
    'en_pause'::public.intervention_status,
    'en_attente'::public.intervention_status
  ];
BEGIN
  panne_text := lower(trim(coalesce(NEW.pannes, '')));
  has_sujets := coalesce(cardinality(NEW.pannes_sujet_ids), 0) > 0;
  has_autre := trim(coalesce(NEW.pannes_autre, '')) <> '';

  IF has_sujets THEN
    FOR sid IN
      SELECT DISTINCT x
      FROM unnest(NEW.pannes_sujet_ids) AS x
      WHERE x IS NOT NULL
    LOOP
      SELECT s.name INTO sujet_name
      FROM public.sujets s
      WHERE s.id = sid AND s.site_id = NEW.site_id;

      ticket_text := coalesce(nullif(trim(sujet_name), ''), 'Sujet #' || sid::text);
      reason := NULL;

      IF NEW.pannes IS NOT NULL AND sujet_name IS NOT NULL THEN
        FOREACH line IN ARRAY string_to_array(NEW.pannes, E'\n') LOOP
          line := trim(line);
          IF line IS NULL OR line = '' OR line = sujet_name THEN
            CONTINUE;
          ELSIF left(line, char_length(sujet_name) + 1) = sujet_name || ':' THEN
            reason := nullif(trim(substr(line, char_length(sujet_name) + 2)), '');
          ELSIF left(line, char_length(sujet_name) + 2) = sujet_name || ' :' THEN
            reason := nullif(trim(substr(line, char_length(sujet_name) + 3)), '');
          END IF;
        END LOOP;
      END IF;

      IF reason IS NOT NULL THEN
        ticket_text := reason;
      END IF;

      existing_id := NULL;
      existing_description := NULL;

      SELECT i.id, i.description
      INTO existing_id, existing_description
      FROM public.intervention i
      WHERE i.daily_info_id = NEW.id
        AND i.sujet_ids = ARRAY[sid]::integer[]
      LIMIT 1;

      IF existing_id IS NULL THEN
        SELECT i.id, i.description
        INTO existing_id, existing_description
        FROM public.intervention i
        WHERE i.site_id = NEW.site_id
          AND i.sujet_ids = ARRAY[sid]::integer[]
          AND i.status = ANY (open_statuses)
        ORDER BY
          CASE WHEN i.status IN ('en_cours', 'en_pause', 'planifiee') THEN 0 ELSE 1 END,
          i.reported_at,
          i.id
        LIMIT 1;
      END IF;

      IF existing_id IS NULL THEN
        INSERT INTO public.intervention (
          site_id, daily_info_id, reported_by, reported_at,
          description, sujet_ids, pannes_autre, urgent, status
        ) VALUES (
          NEW.site_id, NEW.id, NEW.user_id, coalesce(NEW.submitted_at, now()),
          ticket_text, ARRAY[sid]::integer[], ticket_text, false, 'signalee'
        )
        RETURNING id INTO new_id;

        INSERT INTO public.intervention_event (intervention_id, actor_user_id, kind, body)
        VALUES (new_id, NEW.user_id, 'created', ticket_text);
      ELSIF existing_description IS DISTINCT FROM ticket_text THEN
        UPDATE public.intervention
        SET description = ticket_text,
            pannes_autre = ticket_text
        WHERE id = existing_id;
      END IF;
    END LOOP;
  END IF;

  IF has_autre THEN
    ticket_text := trim(NEW.pannes_autre);
    existing_id := NULL;
    existing_description := NULL;

    SELECT i.id, i.description
    INTO existing_id, existing_description
    FROM public.intervention i
    WHERE i.daily_info_id = NEW.id
      AND i.sujet_ids = '{}'::integer[]
    LIMIT 1;

    IF existing_id IS NULL THEN
      SELECT i.id, i.description
      INTO existing_id, existing_description
      FROM public.intervention i
      WHERE i.site_id = NEW.site_id
        AND i.sujet_ids = '{}'::integer[]
        AND i.status = ANY (open_statuses)
        AND lower(trim(coalesce(nullif(trim(i.pannes_autre), ''), i.description)))
            = lower(ticket_text)
      ORDER BY
        CASE WHEN i.status IN ('en_cours', 'en_pause', 'planifiee') THEN 0 ELSE 1 END,
        i.reported_at,
        i.id
      LIMIT 1;
    END IF;

    IF existing_id IS NULL THEN
      INSERT INTO public.intervention (
        site_id, daily_info_id, reported_by, reported_at,
        description, sujet_ids, pannes_autre, urgent, status
      ) VALUES (
        NEW.site_id, NEW.id, NEW.user_id, coalesce(NEW.submitted_at, now()),
        ticket_text, '{}'::integer[], ticket_text, false, 'signalee'
      )
      RETURNING id INTO new_id;

      INSERT INTO public.intervention_event (intervention_id, actor_user_id, kind, body)
      VALUES (new_id, NEW.user_id, 'created', ticket_text);
    ELSIF existing_description IS DISTINCT FROM ticket_text THEN
      UPDATE public.intervention
      SET description = ticket_text,
          pannes_autre = ticket_text
      WHERE id = existing_id;
    END IF;
  END IF;

  IF NOT has_sujets AND NOT has_autre THEN
    IF panne_text = '' OR panne_text IN ('pas de panne', 'rien', 'ras', 'aucune') THEN
      RETURN NEW;
    END IF;

    ticket_text := trim(NEW.pannes);
    existing_id := NULL;
    existing_description := NULL;

    SELECT i.id, i.description
    INTO existing_id, existing_description
    FROM public.intervention i
    WHERE i.daily_info_id = NEW.id
      AND i.sujet_ids = '{}'::integer[]
    LIMIT 1;

    IF existing_id IS NULL THEN
      SELECT i.id, i.description
      INTO existing_id, existing_description
      FROM public.intervention i
      WHERE i.site_id = NEW.site_id
        AND i.sujet_ids = '{}'::integer[]
        AND i.status = ANY (open_statuses)
        AND lower(trim(coalesce(nullif(trim(i.pannes_autre), ''), i.description)))
            = lower(ticket_text)
      ORDER BY
        CASE WHEN i.status IN ('en_cours', 'en_pause', 'planifiee') THEN 0 ELSE 1 END,
        i.reported_at,
        i.id
      LIMIT 1;
    END IF;

    IF existing_id IS NULL THEN
      INSERT INTO public.intervention (
        site_id, daily_info_id, reported_by, reported_at,
        description, sujet_ids, pannes_autre, urgent, status
      ) VALUES (
        NEW.site_id, NEW.id, NEW.user_id, coalesce(NEW.submitted_at, now()),
        ticket_text, '{}'::integer[], ticket_text, false, 'signalee'
      )
      RETURNING id INTO new_id;

      INSERT INTO public.intervention_event (intervention_id, actor_user_id, kind, body)
      VALUES (new_id, NEW.user_id, 'created', ticket_text);
    ELSIF existing_description IS DISTINCT FROM ticket_text THEN
      UPDATE public.intervention
      SET description = ticket_text,
          pannes_autre = ticket_text
      WHERE id = existing_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_intervention_from_panne() IS
  'Après insert/update daily_info pannes : 1 ticket/sujet (+ autre). Dédup ouvert site×sujet ; event created.';

-- Backfill soft : notes historiques → events comment
INSERT INTO public.intervention_event (intervention_id, actor_user_id, kind, body, created_at)
SELECT
  i.id,
  i.reported_by,
  'comment',
  i.resolution_notes,
  coalesce(i.updated_at, i.created_at)
FROM public.intervention i
WHERE i.resolution_notes IS NOT NULL
  AND trim(i.resolution_notes) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.intervention_event e
    WHERE e.intervention_id = i.id AND e.kind = 'comment'
  );
