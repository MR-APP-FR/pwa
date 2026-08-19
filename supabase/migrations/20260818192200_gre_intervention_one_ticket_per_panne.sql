-- 1 ticket CRM = 1 texte. Le formulaire PWA reste groupé (info-jour) ;
-- le trigger éclate : 1 ligne par sujet + 1 ligne pour « autre ».

CREATE OR REPLACE FUNCTION public.create_intervention_from_panne()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  panne_text text;
  has_sujets boolean;
  has_autre boolean;
  sid integer;
  sujet_name text;
  ticket_text text;
  line text;
  reason text;
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
        NEW.site_id,
        NEW.id,
        NEW.user_id,
        coalesce(NEW.submitted_at, now()),
        ticket_text,
        ARRAY[sid]::integer[],
        ticket_text,
        false,
        'signalee'
      );
    END LOOP;
  END IF;

  IF has_autre THEN
    ticket_text := trim(NEW.pannes_autre);
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
      NEW.site_id,
      NEW.id,
      NEW.user_id,
      coalesce(NEW.submitted_at, now()),
      ticket_text,
      '{}'::integer[],
      ticket_text,
      false,
      'signalee'
    );
  END IF;

  IF NOT has_sujets AND NOT has_autre THEN
    IF panne_text = '' OR panne_text IN ('pas de panne', 'rien', 'ras', 'aucune') THEN
      RETURN NEW;
    END IF;

    ticket_text := trim(NEW.pannes);
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
      NEW.site_id,
      NEW.id,
      NEW.user_id,
      coalesce(NEW.submitted_at, now()),
      ticket_text,
      '{}'::integer[],
      ticket_text,
      false,
      'signalee'
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_intervention_from_panne() IS
  'Après insert daily_info : 1 ticket intervention par sujet + 1 ticket pour pannes_autre.';
