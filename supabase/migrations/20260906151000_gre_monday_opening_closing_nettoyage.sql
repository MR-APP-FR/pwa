-- Lundi ouverture : panneaux + affaires (jsonb).
-- Fermeture : nettoyage fait + photo seau / raison.
-- RPC bureau si Non panneaux/affaires (idempotent site × jour).

ALTER TABLE public.opening_form
  ADD COLUMN IF NOT EXISTS panneaux jsonb NULL,
  ADD COLUMN IF NOT EXISTS affaires jsonb NULL;

COMMENT ON COLUMN public.opening_form.panneaux IS
  'Lundi : présence panneaux collés/volants — clés prix, consigne_securite, info, reviens_5mn, en_panne, pause_dej (bool).';
COMMENT ON COLUMN public.opening_form.affaires IS
  'Lundi : stock affaires — clés produits_entretien, fournitures, rouleaux_cb → { present: bool, reste: int|null }.';

ALTER TABLE public.closing_form
  ADD COLUMN IF NOT EXISTS nettoyage_fait boolean NULL,
  ADD COLUMN IF NOT EXISTS photo_seau_url text NULL,
  ADD COLUMN IF NOT EXISTS photo_seau_source text NULL,
  ADD COLUMN IF NOT EXISTS photo_seau_captured_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS nettoyage_raison text NULL;

COMMENT ON COLUMN public.closing_form.nettoyage_fait IS
  'Fermeture : nettoyage effectué (Oui/Non).';
COMMENT ON COLUMN public.closing_form.photo_seau_url IS
  'Path Storage (bucket telecollecte-photos) — photo du seau si nettoyage Oui.';
COMMENT ON COLUMN public.closing_form.photo_seau_source IS
  'Source photo seau : camera_live | phototheque.';
COMMENT ON COLUMN public.closing_form.photo_seau_captured_at IS
  'Horodatage capture photo seau.';
COMMENT ON COLUMN public.closing_form.nettoyage_raison IS
  'Raison si nettoyage Non.';

CREATE OR REPLACE FUNCTION public.report_monday_opening_issues_to_bureau(
  p_site_id integer,
  p_date date,
  p_payload jsonb
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
  corps text;
  issues text := '';
  item_key text;
  item_label text;
  item_val jsonb;
  reste_val text;
BEGIN
  emp_id := public.current_employee_id();
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Compte non lié à un employé';
  END IF;

  IF p_payload IS NULL OR p_payload = '{}'::jsonb THEN
    RETURN;
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
      AND sm.meta->>'kind' = 'monday_opening_issues'
      AND (sm.meta->>'site_id')::integer = p_site_id
      AND sm.meta->>'date' = p_date::text
  ) THEN
    RETURN;
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

  -- Panneaux absents (valeur false)
  IF p_payload ? 'panneaux' AND jsonb_typeof(p_payload->'panneaux') = 'object' THEN
    FOR item_key, item_val IN
      SELECT key, value FROM jsonb_each(p_payload->'panneaux')
    LOOP
      IF item_val = 'false'::jsonb THEN
        item_label := CASE item_key
          WHEN 'prix' THEN 'Panneau Prix'
          WHEN 'consigne_securite' THEN 'Consigne de sécurité'
          WHEN 'info' THEN 'Info'
          WHEN 'reviens_5mn' THEN 'Je reviens dans 5mn'
          WHEN 'en_panne' THEN 'En panne'
          WHEN 'pause_dej' THEN 'Pause Dej'
          ELSE item_key
        END;
        issues := issues || chr(10) || '- Panneau absent: ' || item_label;
      END IF;
    END LOOP;
  END IF;

  -- Affaires manquantes (present = false)
  IF p_payload ? 'affaires' AND jsonb_typeof(p_payload->'affaires') = 'object' THEN
    FOR item_key, item_val IN
      SELECT key, value FROM jsonb_each(p_payload->'affaires')
    LOOP
      IF COALESCE((item_val->>'present')::boolean, true) = false THEN
        item_label := CASE item_key
          WHEN 'produits_entretien' THEN 'Produits entretien'
          WHEN 'fournitures' THEN 'Fournitures'
          WHEN 'rouleaux_cb' THEN 'Rouleaux CB'
          ELSE item_key
        END;
        reste_val := item_val->>'reste';
        issues := issues || chr(10) || '- Affaire insuffisante: ' || item_label;
        IF reste_val IS NOT NULL AND reste_val <> '' THEN
          issues := issues || ' (reste: ' || reste_val || ')';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF issues = '' THEN
    RETURN;
  END IF;

  corps := 'Ouverture lundi — manques signalés'
    || chr(10) || 'Site: ' || site_label
    || chr(10) || 'Date: ' || to_char(p_date, 'DD/MM/YYYY')
    || chr(10) || 'Teneur: ' || COALESCE(teneur_name, '-');
  IF double_name IS NOT NULL THEN
    corps := corps || chr(10) || 'Double: ' || double_name;
  END IF;
  corps := corps || chr(10) || 'Détails:' || issues;

  INSERT INTO public.staff_message (
    titre,
    corps,
    source,
    channel,
    auteur_uuid,
    site_ids,
    user_ids,
    require_ack,
    meta
  ) VALUES (
    'Ouverture lundi — manques',
    corps,
    'appli',
    'bureau',
    NULL,
    '{}'::integer[],
    '{}'::integer[],
    false,
    jsonb_build_object(
      'kind', 'monday_opening_issues',
      'site_id', p_site_id,
      'date', p_date::text
    )
  );
END;
$$;

COMMENT ON FUNCTION public.report_monday_opening_issues_to_bureau(integer, date, jsonb) IS
  'Ouverture lundi : alerte canal Bureau si panneaux/affaires en Non (idempotent site × jour).';

REVOKE ALL ON FUNCTION public.report_monday_opening_issues_to_bureau(integer, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_monday_opening_issues_to_bureau(integer, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_monday_opening_issues_to_bureau(integer, date, jsonb) TO authenticated;
