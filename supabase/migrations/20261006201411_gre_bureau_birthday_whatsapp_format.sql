-- Anniversaires Bureau : format WhatsApp simple (une ligne 🎂 par personne + date).

DROP INDEX IF EXISTS public.staff_message_bureau_birthdays_day;

CREATE UNIQUE INDEX staff_message_bureau_birthdays_day
  ON public.staff_message ((timezone('Europe/Paris', publie_at)::date))
  WHERE channel = 'bureau'
    AND source = 'appli'
    AND titre IN ('Anniversaires', '⚠️ Anniversaires', '⚠️ Anniversaire');

CREATE OR REPLACE FUNCTION internal.post_bureau_birthdays(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'internal'
AS $$
DECLARE
  v_today date := internal.paris_today();
  v_hour integer := EXTRACT(HOUR FROM timezone('Europe/Paris', now()))::integer;
  v_names text[];
  v_corps text;
BEGIN
  IF NOT p_force AND v_hour <> 6 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'wrong_hour', 'hour', v_hour);
  END IF;

  SELECT coalesce(array_agg(n.nom ORDER BY n.nom), ARRAY[]::text[])
  INTO v_names
  FROM (
    SELECT DISTINCT public.employee_bureau_short_name(ui.user_id) AS nom
    FROM public.user_info ui
    JOIN public."user" u ON u.id = ui.user_id
    WHERE ui.date_de_naissance IS NOT NULL
      AND u.actif IS DISTINCT FROM false
      AND internal.is_birthday_on_paris_day(ui.date_de_naissance::date, v_today)
  ) n;

  IF coalesce(array_length(v_names, 1), 0) = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'skipped', 'none', 'names', '[]'::jsonb);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_message sm
    WHERE sm.channel = 'bureau'
      AND sm.source = 'appli'
      AND sm.titre IN ('Anniversaires', '⚠️ Anniversaires', '⚠️ Anniversaire')
      AND timezone('Europe/Paris', sm.publie_at)::date = v_today
  ) THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_today',
      'names', to_jsonb(v_names)
    );
  END IF;

  v_corps := (
    SELECT string_agg('🎂 Anniversaire de ' || nom, E'\n' ORDER BY nom)
    FROM unnest(v_names) AS nom
  )
    || E'\n' || public.bureau_msg_line('📅', 'Date', to_char(v_today, 'DD/MM/YYYY'), 4);

  BEGIN
    INSERT INTO public.staff_message (
      titre, corps, source, channel, auteur_uuid, site_ids, user_ids, require_ack
    ) VALUES (
      '⚠️ Anniversaire', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'skipped', 'already_today',
      'names', to_jsonb(v_names)
    );
  END;

  RETURN jsonb_build_object('inserted', true, 'names', to_jsonb(v_names));
END;
$$;
