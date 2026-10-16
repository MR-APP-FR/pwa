-- Horaires exceptionnels par manège × jour.
-- Ne remplace pas site_infos.heures_semaine : uniquement les jours choisis.

CREATE TABLE public.site_day_hours (
  site_id integer NOT NULL REFERENCES public.site (id) ON DELETE CASCADE,
  day date NOT NULL,
  ouvre text,
  ferme text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, day),
  CONSTRAINT site_day_hours_ouvre_fmt CHECK (
    ouvre IS NULL OR ouvre ~ '^\d{2}:\d{2}:\d{2}$'
  ),
  CONSTRAINT site_day_hours_ferme_fmt CHECK (
    ferme IS NULL OR ferme ~ '^\d{2}:\d{2}:\d{2}$'
  ),
  CONSTRAINT site_day_hours_has_override CHECK (ouvre IS NOT NULL OR ferme IS NOT NULL)
);

CREATE INDEX site_day_hours_day_idx ON public.site_day_hours (day);

COMMENT ON TABLE public.site_day_hours IS
  'Exception d''horaire ouverture (ouvre) ou fermeture (ferme) pour un jour précis. NULL = horaire habituel de site_infos.heures_semaine.';

ALTER TABLE public.site_day_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_day_hours select auth" ON public.site_day_hours
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "site_day_hours admin write" ON public.site_day_hours
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT SELECT ON public.site_day_hours TO authenticated;

-- Horaire effectif : exception du jour, sinon fiche manège.
CREATE OR REPLACE FUNCTION public.site_clock(
  p_site_id integer,
  p_date date,
  p_field text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF(
      btrim(
        CASE p_field
          WHEN 'ouvre' THEN h.ouvre
          WHEN 'ferme' THEN h.ferme
          ELSE NULL
        END
      ),
      ''
    ),
    NULLIF(
      btrim(si.heures_semaine -> EXTRACT(ISODOW FROM p_date)::integer::text ->> p_field),
      ''
    )
  )
  FROM (SELECT p_site_id AS site_id, p_date AS day) AS req
  LEFT JOIN public.site_day_hours AS h
    ON h.site_id = req.site_id
   AND h.day = req.day
  LEFT JOIN public.site_infos AS si
    ON si.site_id = req.site_id;
$$;

REVOKE ALL ON FUNCTION public.site_clock(integer, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_clock(integer, date, text) TO authenticated;

COMMENT ON FUNCTION public.site_clock(integer, date, text) IS
  'Heure effective (ouvre ou ferme) d''un manège à une date : site_day_hours sinon heures_semaine.';

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
  ouvre_raw text;
  ouvre_time text;
BEGIN
  ouvre_raw := NULLIF(btrim(public.site_clock(p_site_id, p_date, 'ouvre')), '');

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

CREATE OR REPLACE FUNCTION public.get_crm_badge_counts(p_now timestamp with time zone DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  paris_ts timestamp;
  paris_date date;
  y integer;
  m integer;
  d integer;
  late_opening integer := 0;
  bureau_unread integer := 0;
  uid uuid;
  seen_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'late_opening', 0,
      'late_closing', 0,
      'bureau_unread', 0
    );
  END IF;

  paris_ts := timezone('Europe/Paris', p_now);
  paris_date := paris_ts::date;
  y := EXTRACT(YEAR FROM paris_ts)::integer;
  m := EXTRACT(MONTH FROM paris_ts)::integer;
  d := EXTRACT(DAY FROM paris_ts)::integer;

  SELECT COUNT(*)::integer
  INTO late_opening
  FROM (
    SELECT DISTINCT ON (p.site_id) p.site_id
    FROM public.planning AS p
    CROSS JOIN LATERAL (
      SELECT public.site_clock(p.site_id, paris_date, 'ouvre') AS ouvre
    ) AS clk
    WHERE p.year = y
      AND p.month = m
      AND p.day = d
      AND COALESCE(p.closed, false) IS NOT TRUE
      AND (p.user_id IS NOT NULL OR p.double_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM public.opening_form AS oform
        WHERE oform.site_id = p.site_id
          AND oform.date = paris_date
      )
      AND NULLIF(btrim(clk.ouvre), '') IS NOT NULL
      AND clk.ouvre ~ '^\d{1,2}:\d{2}(:\d{2})?$'
      AND p_now > (
        (
          paris_date::text
          || ' '
          || CASE
            WHEN length(btrim(clk.ouvre)) = 5 THEN btrim(clk.ouvre) || ':00'
            ELSE btrim(clk.ouvre)
          END
        )::timestamp
        AT TIME ZONE 'Europe/Paris'
      )
    ORDER BY p.site_id
  ) AS late_sites;

  uid := auth.uid();
  IF uid IS NOT NULL THEN
    SELECT c.bureau_seen_at
    INTO seen_at
    FROM public.admin_message_cursor AS c
    WHERE c.auth_uid = uid;

    IF seen_at IS NULL THEN
      INSERT INTO public.admin_message_cursor (auth_uid, bureau_seen_at, updated_at)
      VALUES (uid, p_now, p_now)
      ON CONFLICT (auth_uid) DO UPDATE
        SET bureau_seen_at = EXCLUDED.bureau_seen_at,
            updated_at = EXCLUDED.updated_at;
      bureau_unread := 0;
    ELSE
      SELECT COUNT(*)::integer
      INTO bureau_unread
      FROM public.staff_message AS sm
      WHERE sm.channel = 'bureau'
        AND sm.publie_at > seen_at;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'late_opening', COALESCE(late_opening, 0),
    'late_closing', 0,
    'bureau_unread', COALESCE(bureau_unread, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_crm_badge_counts(timestamptz) IS
  'Admin : pastilles ouverture en retard (horaire effectif site_clock) + bureau non lu. late_closing toujours 0.';
