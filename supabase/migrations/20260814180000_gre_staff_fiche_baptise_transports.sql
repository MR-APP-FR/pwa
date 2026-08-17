-- Fiche staff papier : baptisé + transports en commun en booléen (Oui/Non, NULL = non renseigné).

ALTER TABLE public.user_info
  ADD COLUMN IF NOT EXISTS baptise boolean;

COMMENT ON COLUMN public.user_info.baptise IS
  'Baptisé(e). Distinct de chretienne. NULL = non renseigné.';

ALTER TABLE public.user_info
  ALTER COLUMN les_transports TYPE boolean
  USING CASE
    WHEN les_transports IS NULL THEN NULL
    WHEN lower(trim(les_transports::text)) IN ('oui') THEN true
    WHEN lower(trim(les_transports::text)) IN ('non') THEN false
    ELSE NULL
  END;

COMMENT ON COLUMN public.user_info.les_transports IS
  'Utilise les transports en commun. NULL = non renseigné.';
