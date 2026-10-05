-- Messages Bureau / Inter : alignement carré (pad avant « : »), initiale nom, sans Attendu.

-- ---------------------------------------------------------------------------
-- Raccourci prénom + initiale nom (ex. « Melina Z. »)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bureau_shorten_person_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  n integer;
  family_start integer;
  given text;
  initial text;
  last_tok text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN '-';
  END IF;
  IF btrim(p_name) = '-' THEN
    RETURN '-';
  END IF;

  parts := regexp_split_to_array(btrim(p_name), '\s+');
  n := coalesce(array_length(parts, 1), 0);
  IF n <= 1 THEN
    RETURN btrim(p_name);
  END IF;

  last_tok := parts[n];
  -- Déjà une initiale (éventuellement avec point)
  IF last_tok ~* '^[A-Za-zÀ-ÖØ-öø-ÿ]\.?$' THEN
    given := array_to_string(parts[1:n - 1], ' ');
    RETURN given || ' ' || upper(left(last_tok, 1)) || '.';
  END IF;

  -- Tokens famille en MAJUSCULES en fin de chaîne (ex. DELLA PIETRA)
  family_start := n;
  WHILE family_start > 1
    AND parts[family_start] ~ '^[A-ZÀ-ÖØ]{2,}([ ''-][A-ZÀ-ÖØ]+)*$'
  LOOP
    family_start := family_start - 1;
  END LOOP;
  IF family_start < n THEN
    family_start := family_start + 1;
  ELSE
    family_start := n;
  END IF;

  given := array_to_string(parts[1:family_start - 1], ' ');
  IF given = '' THEN
    RETURN btrim(p_name);
  END IF;
  initial := upper(left(parts[family_start], 1));
  RETURN given || ' ' || initial || '.';
END;
$$;

COMMENT ON FUNCTION public.bureau_shorten_person_name(text) IS
  'Prénom + initiale nom avec point (messages Bureau / Inter).';

CREATE OR REPLACE FUNCTION public.employee_bureau_short_name(p_user_id integer)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.bureau_shorten_person_name(public.employee_display_name(p_user_id));
$$;

COMMENT ON FUNCTION public.employee_bureau_short_name(integer) IS
  'Libellé court employé pour messages auto Bureau / Inter.';

REVOKE ALL ON FUNCTION public.bureau_shorten_person_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bureau_shorten_person_name(text) FROM anon;
REVOKE ALL ON FUNCTION public.bureau_shorten_person_name(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.employee_bureau_short_name(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_bureau_short_name(integer) FROM anon;
REVOKE ALL ON FUNCTION public.employee_bureau_short_name(integer) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Ligne : emoji Label[pad] : valeur  (espaces avant le « : », modèle Kevin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bureau_msg_line(
  p_emoji text,
  p_label text,
  p_value text,
  p_pad integer DEFAULT 7
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_emoji
    || ' '
    || p_label
    || repeat(' ', GREATEST(0, p_pad - char_length(p_label)))
    || ' : '
    || p_value;
$$;

COMMENT ON FUNCTION public.bureau_msg_line(text, text, text, integer) IS
  'Ligne message Bureau : emoji Label[pad] : valeur (alignement des « : »).';

CREATE OR REPLACE FUNCTION public.bureau_msg_common_lines(
  p_site_label text,
  p_teneur_name text,
  p_date date,
  p_pad integer DEFAULT 7
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.bureau_msg_line('📍', 'Site', upper(COALESCE(p_site_label, '-')), p_pad)
    || chr(10) || public.bureau_msg_line(
         '👤',
         'Teneur',
         public.bureau_shorten_person_name(COALESCE(p_teneur_name, '-')),
         p_pad
       )
    || chr(10) || public.bureau_msg_line('📅', 'Date', to_char(p_date, 'DD/MM/YYYY'), p_pad);
$$;

-- ---------------------------------------------------------------------------
-- Chrono lundi : plus de ligne Attendu
-- ---------------------------------------------------------------------------
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
  mins integer;
  secs integer;
  ticket_name text;
  corps text;
  pad integer := 7;
  chrono_label text;
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

  SELECT public.employee_bureau_short_name(p.user_id)
  INTO teneur_name
  FROM public.planning AS p
  WHERE p.site_id = p_site_id
    AND p.year = EXTRACT(YEAR FROM p_date)::integer
    AND p.month = EXTRACT(MONTH FROM p_date)::integer
    AND p.day = EXTRACT(DAY FROM p_date)::integer
  LIMIT 1;

  mins := p_chrono_seconds / 60;
  secs := p_chrono_seconds % 60;
  ticket_name := 'chrono mal calibré à ' || mins::text || 'min' || secs::text || 'sec';
  chrono_label := mins::text || ' min ' || secs::text || ' s';

  corps := '⏲️ Chrono mal calibré'
    || chr(10) || public.bureau_msg_common_lines(site_label, teneur_name, p_date, pad)
    || chr(10) || public.bureau_msg_line('⏲️', 'Chrono', chrono_label, pad);

  INSERT INTO public.staff_message (
    titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack, meta
  ) VALUES (
    '⚠️ Chrono',
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
    site_id, daily_info_id, reported_by, reported_at, description,
    sujet_ids, pannes_autre, urgent, status
  ) VALUES (
    p_site_id, NULL, emp_id, now(), ticket_name,
    '{}'::integer[], ticket_name, true, 'signalee'
  );
END;
$$;

COMMENT ON FUNCTION public.report_chrono_out_of_range(integer, date, integer) IS
  'Alerte Bureau chrono hors borne (sans ligne Attendu) + ticket intervention.';

-- Inter : raccourcir noms personnes à l'écriture
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

  corps := CASE WHEN NEW.urgent THEN '🚨 Panne urgente' ELSE '🔧 Nouvelle panne' END
    || chr(10) || public.bureau_msg_line('📍', 'Site', upper(COALESCE(site_label, '-')), pad)
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
-- Backfill : retirer Attendu + raccourcir Teneur / Signalé par / Constaté par
-- ---------------------------------------------------------------------------
UPDATE public.staff_message AS sm
SET corps = regexp_replace(
  sm.corps,
  '(^|' || chr(10) || ')✅[[:space:]]*Attendu[[:space:]]*:[[:space:]]*[^\n]*',
  '',
  'g'
)
WHERE sm.source = 'appli'
  AND sm.channel IN ('bureau', 'inter')
  AND sm.corps ~ 'Attendu';

-- Nettoyage doubles sauts de ligne laissés par la suppression
UPDATE public.staff_message AS sm
SET corps = regexp_replace(sm.corps, '(' || chr(10) || '){3,}', chr(10) || chr(10), 'g')
WHERE sm.source = 'appli'
  AND sm.channel IN ('bureau', 'inter')
  AND sm.corps ~ ('(' || chr(10) || '){3,}');

DO $$
DECLARE
  r record;
  new_corps text;
  m text[];
  label text;
  value text;
  short_v text;
BEGIN
  FOR r IN
    SELECT id, corps
    FROM public.staff_message
    WHERE source = 'appli'
      AND channel IN ('bureau', 'inter')
      AND (
        corps ~ '👤[[:space:]]+(Teneur|Signalé par|Constaté par)[[:space:]]*:'
      )
  LOOP
    new_corps := r.corps;
    FOR m IN
      SELECT regexp_matches(
        r.corps,
        '(👤[[:space:]]+)(Teneur|Signalé par|Constaté par)([[:space:]]*:[[:space:]]*)([^\n]+)',
        'g'
      )
    LOOP
      label := m[2];
      value := m[4];
      short_v := public.bureau_shorten_person_name(value);
      IF short_v IS DISTINCT FROM btrim(value) THEN
        new_corps := replace(
          new_corps,
          m[1] || m[2] || m[3] || m[4],
          m[1] || m[2] || m[3] || short_v
        );
      END IF;
    END LOOP;
    IF new_corps IS DISTINCT FROM r.corps THEN
      UPDATE public.staff_message SET corps = new_corps WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
