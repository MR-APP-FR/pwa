-- Dédup interventions : 1 ticket ouvert par (site × sujet) ou (site × texte autre).
-- Avant : dédup seulement dans le même daily_info → re-déclaration jour N+1 = doublon.
-- Puis fusion one-shot des doublons ouverts déjà en base (garde le plus utile, clôture le reste).

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
  open_statuses public.intervention_status[] := ARRAY[
    'signalee'::public.intervention_status,
    'a_planifier'::public.intervention_status,
    'planifiee'::public.intervention_status
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

      -- 1) Même info-jour (idempotence UPDATE)
      SELECT i.id, i.description
      INTO existing_id, existing_description
      FROM public.intervention i
      WHERE i.daily_info_id = NEW.id
        AND i.sujet_ids = ARRAY[sid]::integer[]
      LIMIT 1;

      -- 2) Sinon ticket encore ouvert même site × sujet (anti-doublon multi-jours)
      IF existing_id IS NULL THEN
        SELECT i.id, i.description
        INTO existing_id, existing_description
        FROM public.intervention i
        WHERE i.site_id = NEW.site_id
          AND i.sujet_ids = ARRAY[sid]::integer[]
          AND i.status = ANY (open_statuses)
        ORDER BY
          CASE WHEN i.status = 'planifiee' THEN 0 ELSE 1 END,
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
        );
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
        CASE WHEN i.status = 'planifiee' THEN 0 ELSE 1 END,
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
      );
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
        CASE WHEN i.status = 'planifiee' THEN 0 ELSE 1 END,
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
      );
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
  'Après insert/update daily_info pannes : 1 ticket/sujet (+ autre). Dédup = même daily_info OU ticket ouvert même site×sujet (ou même texte libre).';

-- ---------------------------------------------------------------------------
-- Fusion one-shot des doublons ouverts existants
-- ---------------------------------------------------------------------------

WITH ranked_sujet AS (
  SELECT
    i.id,
    first_value(i.id) OVER (
      PARTITION BY i.site_id, i.sujet_ids
      ORDER BY
        CASE WHEN i.status = 'planifiee' THEN 0 ELSE 1 END,
        i.reported_at,
        i.id
    ) AS keep_id
  FROM public.intervention i
  WHERE i.status IN ('signalee', 'a_planifier', 'planifiee')
    AND cardinality(i.sujet_ids) > 0
),
extras_sujet AS (
  SELECT id, keep_id
  FROM ranked_sujet
  WHERE id <> keep_id
)
UPDATE public.intervention AS i
SET
  status = 'cloturee',
  completed_at = coalesce(i.completed_at, now()),
  resolution_notes = trim(
    both E'\n' FROM concat_ws(
      E'\n',
      nullif(trim(coalesce(i.resolution_notes, '')), ''),
      format(
        '[%s] Doublon auto: fusionné vers #%s',
        (timezone('Europe/Paris', now()))::date,
        e.keep_id
      )
    )
  )
FROM extras_sujet e
WHERE i.id = e.id;

WITH ranked_txt AS (
  SELECT
    i.id,
    first_value(i.id) OVER (
      PARTITION BY
        i.site_id,
        lower(trim(coalesce(nullif(trim(i.pannes_autre), ''), i.description)))
      ORDER BY
        CASE WHEN i.status = 'planifiee' THEN 0 ELSE 1 END,
        i.reported_at,
        i.id
    ) AS keep_id,
    lower(trim(coalesce(nullif(trim(i.pannes_autre), ''), i.description))) AS txt
  FROM public.intervention i
  WHERE i.status IN ('signalee', 'a_planifier', 'planifiee')
    AND cardinality(i.sujet_ids) = 0
),
extras_txt AS (
  SELECT id, keep_id
  FROM ranked_txt
  WHERE id <> keep_id
    AND txt <> ''
)
UPDATE public.intervention AS i
SET
  status = 'cloturee',
  completed_at = coalesce(i.completed_at, now()),
  resolution_notes = trim(
    both E'\n' FROM concat_ws(
      E'\n',
      nullif(trim(coalesce(i.resolution_notes, '')), ''),
      format(
        '[%s] Doublon auto: fusionné vers #%s',
        (timezone('Europe/Paris', now()))::date,
        e.keep_id
      )
    )
  )
FROM extras_txt e
WHERE i.id = e.id;
