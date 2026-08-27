-- Fermeture forcée : la raison et le motif vivent sur closing_form
-- (le board Fermeture CRM peut afficher carte rouge + détail complet).

ALTER TABLE public.closing_form
  ADD COLUMN IF NOT EXISTS force_reason text,
  ADD COLUMN IF NOT EXISTS force_early boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_distance_m integer,
  ADD COLUMN IF NOT EXISTS force_geo_failed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_client_lat double precision,
  ADD COLUMN IF NOT EXISTS force_client_lng double precision;

ALTER TABLE public.closing_form
  DROP CONSTRAINT IF EXISTS closing_form_force_reason_len;
ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_force_reason_len
  CHECK (force_reason IS NULL OR char_length(btrim(force_reason)) BETWEEN 1 AND 500);

ALTER TABLE public.closing_form
  DROP CONSTRAINT IF EXISTS closing_form_force_distance_m_range;
ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_force_distance_m_range
  CHECK (force_distance_m IS NULL OR (force_distance_m >= 0 AND force_distance_m <= 100000));

COMMENT ON COLUMN public.closing_form.force_reason IS
  'Raison saisie pour une fermeture forcee (horaire / distance / GPS).';

-- Rattrapage des alertes Bureau deja envoyees (sans meta.site_id).
UPDATE public.closing_form AS cf
SET
  force_reason = COALESCE(cf.force_reason, nullif(btrim(p.reason), '')),
  force_early = cf.force_early OR p.early,
  force_distance_m = COALESCE(cf.force_distance_m, p.distance_m),
  force_geo_failed = cf.force_geo_failed OR p.geo_failed,
  force_client_lat = COALESCE(cf.force_client_lat, p.client_lat),
  force_client_lng = COALESCE(cf.force_client_lng, p.client_lng)
FROM (
  SELECT
    COALESCE(
      (m.meta ->> 'site_id')::integer,
      s.id
    ) AS site_id,
    COALESCE(
      (m.meta ->> 'date'),
      to_char(m.publie_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')
    )::date AS date,
    nullif(btrim((regexp_match(m.corps, 'Raison:[[:space:]]*(.*)$'))[1]), '') AS reason,
    m.corps ILIKE '%avant 20h05%' AS early,
    m.corps ILIKE '%position non v%' AS geo_failed,
    NULLIF((regexp_match(m.corps, '\+ de ([0-9]+) m'))[1], '')::integer AS distance_m,
    (m.meta ->> 'client_lat')::double precision AS client_lat,
    (m.meta ->> 'client_lng')::double precision AS client_lng
  FROM public.staff_message AS m
  LEFT JOIN public.site AS s
    ON s.name = nullif(btrim((regexp_match(m.corps, 'Site:[[:space:]]*([^\n]+)'))[1]), '')
  WHERE m.channel = 'bureau'
    AND m.titre = 'Fermeture forcée'
) AS p
WHERE cf.site_id = p.site_id
  AND cf.date = p.date
  AND p.site_id IS NOT NULL;
