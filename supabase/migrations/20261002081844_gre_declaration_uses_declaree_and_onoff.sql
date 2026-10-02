-- Taux de déclaration : On (`onoff`) OU fiche « Déclarée » (`declaree`).

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
    WHERE sm.channel = 'bureau'
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
      -- Déclaré = On, ou fiche « Déclarée ». Pas de fiche → On (déclaré).
      WHERE ui.onoff IS DISTINCT FROM false
         OR ui.declaree IS TRUE
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
      'Taux de déclaration', v_corps, 'appli', 'bureau', NULL, '{}', '{}', false
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
