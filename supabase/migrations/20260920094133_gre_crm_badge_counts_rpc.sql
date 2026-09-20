-- Compteurs pastilles CRM (ouverture / fermeture / bureau) en un seul round-trip.
-- Aligné sur admin-desktop-app/lib/opening/late-sites.ts + closing/late-sites.ts + bureau-unread.ts.

CREATE INDEX IF NOT EXISTS staff_message_channel_publie_at_idx
  ON public.staff_message (channel, publie_at);

CREATE OR REPLACE FUNCTION public.get_crm_badge_counts(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  paris_ts timestamp;
  paris_date date;
  y integer;
  m integer;
  d integer;
  jour_key text;
  late_opening integer := 0;
  late_closing integer := 0;
  bureau_unread integer := 0;
  uid uuid;
  seen_at timestamptz;
  closing_late_at timestamptz;
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
  jour_key := EXTRACT(ISODOW FROM paris_ts)::integer::text;

  SELECT COUNT(*)::integer
  INTO late_opening
  FROM (
    SELECT DISTINCT ON (p.site_id) p.site_id
    FROM public.planning AS p
    INNER JOIN public.site_infos AS si ON si.site_id = p.site_id
    WHERE p.year = y
      AND p.month = m
      AND p.day = d
      AND (p.user_id IS NOT NULL OR p.double_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM public.opening_form AS oform
        WHERE oform.site_id = p.site_id
          AND oform.date = paris_date
      )
      AND NULLIF(btrim(si.heures_semaine -> jour_key ->> 'ouvre'), '') IS NOT NULL
      AND (si.heures_semaine -> jour_key ->> 'ouvre') ~ '^\d{1,2}:\d{2}(:\d{2})?$'
      AND p_now > (
        (
          paris_date::text
          || ' '
          || CASE
            WHEN length(btrim(si.heures_semaine -> jour_key ->> 'ouvre')) = 5
              THEN btrim(si.heures_semaine -> jour_key ->> 'ouvre') || ':00'
            ELSE btrim(si.heures_semaine -> jour_key ->> 'ouvre')
          END
        )::timestamp
        AT TIME ZONE 'Europe/Paris'
      )
    ORDER BY p.site_id
  ) AS late_sites;

  closing_late_at := (
    (paris_date::text || ' 20:35:00')::timestamp AT TIME ZONE 'Europe/Paris'
  );

  IF p_now > closing_late_at THEN
    SELECT COUNT(*)::integer
    INTO late_closing
    FROM (
      SELECT DISTINCT ON (p.site_id) p.site_id
      FROM public.planning AS p
      WHERE p.year = y
        AND p.month = m
        AND p.day = d
        AND (p.user_id IS NOT NULL OR p.double_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM public.closing_form AS cform
          WHERE cform.site_id = p.site_id
            AND cform.date = paris_date
        )
      ORDER BY p.site_id
    ) AS late_close_sites;
  END IF;

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
    'late_closing', COALESCE(late_closing, 0),
    'bureau_unread', COALESCE(bureau_unread, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_crm_badge_counts(timestamptz) IS
  'Pastilles CRM admin : ouvertures en retard, fermetures en retard (après 20h35 Paris), messages bureau non lus.';

REVOKE ALL ON FUNCTION public.get_crm_badge_counts(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_crm_badge_counts(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_crm_badge_counts(timestamptz) TO authenticated;
