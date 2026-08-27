-- Position GPS à chaque fermeture (pas seulement si forcée), pour le détail CRM
-- et l'analyse vs l'ouverture du même jour.

ALTER TABLE public.closing_form
  ADD COLUMN IF NOT EXISTS client_lat double precision,
  ADD COLUMN IF NOT EXISTS client_lng double precision;

ALTER TABLE public.closing_form
  DROP CONSTRAINT IF EXISTS closing_form_client_coords_pair;
ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_client_coords_pair
  CHECK (
    (client_lat IS NULL AND client_lng IS NULL)
    OR (
      client_lat IS NOT NULL
      AND client_lng IS NOT NULL
      AND client_lat >= -90 AND client_lat <= 90
      AND client_lng >= -180 AND client_lng <= 180
    )
  );

COMMENT ON COLUMN public.closing_form.client_lat IS
  'Latitude GPS au submit fermeture (détail CRM + analyse vs ouverture).';
COMMENT ON COLUMN public.closing_form.client_lng IS
  'Longitude GPS au submit fermeture (détail CRM + analyse vs ouverture).';

UPDATE public.closing_form
SET
  client_lat = COALESCE(client_lat, force_client_lat),
  client_lng = COALESCE(client_lng, force_client_lng)
WHERE force_client_lat IS NOT NULL
  AND force_client_lng IS NOT NULL;
