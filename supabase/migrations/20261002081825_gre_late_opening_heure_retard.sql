-- Ouverture en retard Bureau : heure d'ouverture + durée de retard.
-- À l'envoi de la raison : provisional (now). Au submit opening_form : heure réelle.

ALTER TABLE public.opening_late_alert
  ADD COLUMN IF NOT EXISTS bureau_message_id bigint
    REFERENCES public.staff_message(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.opening_late_alert.bureau_message_id IS
  'staff_message Bureau « Ouverture en retard » lié, enrichi à l''ouverture réelle.';

CREATE OR REPLACE FUNCTION public.format_paris_hm(p_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    to_char(timezone('Europe/Paris', p_at), 'FMHH24')
    || 'H'
    || to_char(timezone('Europe/Paris', p_at), 'MI');
$$;

CREATE OR REPLACE FUNCTION public.format_opening_late_delay(
  p_opened_at timestamptz,
  p_deadline timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  secs integer;
  mins integer;
  hours integer;
  rem_mins integer;
BEGIN
  IF p_opened_at IS NULL OR p_deadline IS NULL OR p_opened_at <= p_deadline THEN
    RETURN '0 min';
  END IF;
  secs := EXTRACT(EPOCH FROM (p_opened_at - p_deadline))::integer;
  mins := GREATEST(1, (secs + 30) / 60); -- arrondi minute
  IF mins < 60 THEN
    RETURN mins::text || ' min';
  END IF;
  hours := mins / 60;
  rem_mins := mins % 60;
  IF rem_mins = 0 THEN
    RETURN hours::text || ' h';
  END IF;
  RETURN hours::text || ' h ' || lpad(rem_mins::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.site_opening_deadline_at(
  p_site_id integer,
  p_date date
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  jour_key text;
  ouvre_raw text;
  ouvre_time text;
BEGIN
  jour_key := EXTRACT(ISODOW FROM p_date)::integer::text;
  SELECT NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '')
  INTO ouvre_raw
  FROM public.site_infos AS si
  WHERE si.site_id = p_site_id;

  IF ouvre_raw IS NULL OR ouvre_raw !~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
    RETURN NULL;
  END IF;

  ouvre_time := CASE
    WHEN length(ouvre_raw) = 5 THEN ouvre_raw || ':00'
    ELSE ouvre_raw
  END;

  RETURN (p_date::text || ' ' || ouvre_time)::timestamp AT TIME ZONE 'Europe/Paris';
END;
$$;

CREATE OR REPLACE FUNCTION public.build_late_opening_corps(
  p_hour_label text,
  p_site_label text,
  p_teneur_name text,
  p_double_name text,
  p_reason text,
  p_opened_at timestamptz,
  p_deadline timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  corps text;
BEGIN
  corps := 'Motif: ouverture non effectuée après ' || p_hour_label
    || chr(10) || 'Site: ' || p_site_label
    || chr(10) || 'Teneur: ' || COALESCE(p_teneur_name, '-')
    || CASE
         WHEN p_double_name IS NULL THEN ''
         ELSE chr(10) || 'Double: ' || p_double_name
       END
    || chr(10) || 'Raison: ' || p_reason;

  IF p_opened_at IS NOT NULL THEN
    corps := corps
      || chr(10) || 'Heure d''ouverture: ' || public.format_paris_hm(p_opened_at);
    IF p_deadline IS NOT NULL THEN
      corps := corps
        || chr(10) || 'Retard: ' || public.format_opening_late_delay(p_opened_at, p_deadline);
    END IF;
  END IF;

  RETURN corps;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_late_opening_to_bureau(
  p_site_id integer,
  p_date date,
  p_reason text,
  p_ouvre_label text DEFAULT NULL
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
  hour_label text;
  corps text;
  reason text;
  msg_id bigint;
  deadline timestamptz;
  opened_at timestamptz := now();
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  reason := nullif(btrim(p_reason), '');
  IF reason IS NULL THEN
    RAISE EXCEPTION 'Raison obligatoire';
  END IF;
  IF char_length(reason) > 500 THEN
    RAISE EXCEPTION 'Raison trop longue';
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

  IF EXISTS (
    SELECT 1
    FROM public.opening_late_alert AS a
    WHERE a.site_id = p_site_id
      AND a.date = p_date
      AND a.reported_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

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

  hour_label := nullif(btrim(COALESCE(p_ouvre_label, '')), '');
  IF hour_label IS NULL THEN
    hour_label := 'l''horaire prévu';
  END IF;

  deadline := public.site_opening_deadline_at(p_site_id, p_date);

  -- Si le formulaire d'ouverture existe déjà, utiliser son submitted_at.
  SELECT oform.submitted_at
  INTO opened_at
  FROM public.opening_form AS oform
  WHERE oform.site_id = p_site_id
    AND oform.date = p_date;
  IF opened_at IS NULL THEN
    opened_at := now();
  END IF;

  corps := public.build_late_opening_corps(
    hour_label,
    site_label,
    teneur_name,
    double_name,
    reason,
    opened_at,
    deadline
  );

  INSERT INTO public.staff_message (
    titre,
    corps,
    source,
    channel,
    auteur_uuid,
    site_ids,
    user_ids,
    require_ack
  ) VALUES (
    'Ouverture en retard',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false
  )
  RETURNING id INTO msg_id;

  INSERT INTO public.opening_late_alert (
    site_id,
    date,
    report_user_id,
    report_reason,
    reported_at,
    bureau_message_id
  ) VALUES (
    p_site_id,
    p_date,
    emp_id,
    reason,
    now(),
    msg_id
  )
  ON CONFLICT (site_id, date) DO UPDATE
    SET report_user_id = EXCLUDED.report_user_id,
        report_reason = EXCLUDED.report_reason,
        reported_at = EXCLUDED.reported_at,
        bureau_message_id = EXCLUDED.bureau_message_id
    WHERE opening_late_alert.reported_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.report_late_opening_to_bureau(integer, date, text, text) IS
  'Employé planifié : signale ouverture en retard au Bureau (heure + retard).';

CREATE OR REPLACE FUNCTION public.enrich_late_opening_bureau_from_opening_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alert_row public.opening_late_alert%ROWTYPE;
  site_label text;
  teneur_name text;
  double_name text;
  hour_label text;
  ouvre_raw text;
  jour_key text;
  deadline timestamptz;
  new_corps text;
BEGIN
  SELECT *
  INTO alert_row
  FROM public.opening_late_alert AS a
  WHERE a.site_id = NEW.site_id
    AND a.date = NEW.date
    AND a.reported_at IS NOT NULL
    AND a.bureau_message_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT s.name INTO site_label
  FROM public.site AS s
  WHERE s.id = NEW.site_id;

  SELECT
    public.employee_display_name(p.user_id),
    public.employee_display_name(p.double_id)
  INTO teneur_name, double_name
  FROM public.planning AS p
  WHERE p.site_id = NEW.site_id
    AND p.year = EXTRACT(YEAR FROM NEW.date)::integer
    AND p.month = EXTRACT(MONTH FROM NEW.date)::integer
    AND p.day = EXTRACT(DAY FROM NEW.date)::integer
  LIMIT 1;

  jour_key := EXTRACT(ISODOW FROM NEW.date)::integer::text;
  SELECT NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '')
  INTO ouvre_raw
  FROM public.site_infos AS si
  WHERE si.site_id = NEW.site_id;

  IF ouvre_raw IS NOT NULL AND ouvre_raw ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
    hour_label :=
      (regexp_match(ouvre_raw, '^(\d{1,2})'))[1]
      || 'H'
      || (regexp_match(ouvre_raw, ':(\d{2})'))[1];
  ELSE
    hour_label := 'l''horaire prévu';
  END IF;

  deadline := public.site_opening_deadline_at(NEW.site_id, NEW.date);

  new_corps := public.build_late_opening_corps(
    hour_label,
    COALESCE(site_label, '-'),
    teneur_name,
    double_name,
    COALESCE(alert_row.report_reason, '-'),
    NEW.submitted_at,
    deadline
  );

  UPDATE public.staff_message AS sm
  SET corps = new_corps
  WHERE sm.id = alert_row.bureau_message_id
    AND sm.titre = 'Ouverture en retard'
    AND sm.channel = 'bureau';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrich_late_opening_bureau ON public.opening_form;
CREATE TRIGGER trg_enrich_late_opening_bureau
  AFTER INSERT OR UPDATE OF submitted_at
  ON public.opening_form
  FOR EACH ROW
  EXECUTE FUNCTION public.enrich_late_opening_bureau_from_opening_form();

-- Rattrapage : messages déjà postés aujourd'hui avec opening_form mais sans heure/retard.
-- Lie aussi bureau_message_id quand on peut le retrouver (même site/jour via corps).
DO $$
DECLARE
  r record;
  deadline timestamptz;
  new_corps text;
  site_label text;
  teneur_name text;
  double_name text;
  hour_label text;
  ouvre_raw text;
  jour_key text;
BEGIN
  FOR r IN
    SELECT
      a.site_id,
      a.date,
      a.report_reason,
      a.bureau_message_id,
      oform.submitted_at,
      sm.id AS msg_id
    FROM public.opening_late_alert AS a
    INNER JOIN public.opening_form AS oform
      ON oform.site_id = a.site_id AND oform.date = a.date
    LEFT JOIN public.staff_message AS sm
      ON sm.id = a.bureau_message_id
      OR (
        a.bureau_message_id IS NULL
        AND sm.channel = 'bureau'
        AND sm.source = 'appli'
        AND sm.titre = 'Ouverture en retard'
        AND sm.publie_at = a.reported_at
      )
    WHERE a.reported_at IS NOT NULL
      AND a.date >= (timezone('Europe/Paris', now()))::date - 7
  LOOP
    IF r.msg_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT s.name INTO site_label FROM public.site s WHERE s.id = r.site_id;

    SELECT
      public.employee_display_name(p.user_id),
      public.employee_display_name(p.double_id)
    INTO teneur_name, double_name
    FROM public.planning AS p
    WHERE p.site_id = r.site_id
      AND p.year = EXTRACT(YEAR FROM r.date)::integer
      AND p.month = EXTRACT(MONTH FROM r.date)::integer
      AND p.day = EXTRACT(DAY FROM r.date)::integer
    LIMIT 1;

    jour_key := EXTRACT(ISODOW FROM r.date)::integer::text;
    SELECT NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '')
    INTO ouvre_raw
    FROM public.site_infos AS si
    WHERE si.site_id = r.site_id;

    IF ouvre_raw IS NOT NULL AND ouvre_raw ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
      hour_label :=
        (regexp_match(ouvre_raw, '^(\d{1,2})'))[1]
        || 'H'
        || (regexp_match(ouvre_raw, ':(\d{2})'))[1];
    ELSE
      hour_label := 'l''horaire prévu';
    END IF;

    deadline := public.site_opening_deadline_at(r.site_id, r.date);
    new_corps := public.build_late_opening_corps(
      hour_label,
      COALESCE(site_label, '-'),
      teneur_name,
      double_name,
      COALESCE(r.report_reason, '-'),
      r.submitted_at,
      deadline
    );

    UPDATE public.staff_message AS sm
    SET corps = new_corps
    WHERE sm.id = r.msg_id;

    UPDATE public.opening_late_alert AS a
    SET bureau_message_id = r.msg_id
    WHERE a.site_id = r.site_id
      AND a.date = r.date
      AND a.bureau_message_id IS NULL;
  END LOOP;
END;
$$;
