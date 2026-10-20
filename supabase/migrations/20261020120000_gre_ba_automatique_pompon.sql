-- BA = centre automatique : hors CA (UI CRM filtre statut automatique).
-- Pompon : option manège (`site_infos.pompon`) + réponse ouverture lundi (`daily_info.pompon`).

UPDATE public.site
SET statut = 'automatique'
WHERE id = 1000
  AND name = 'BA'
  AND statut IS DISTINCT FROM 'automatique';

ALTER TABLE public.site_infos
  ADD COLUMN IF NOT EXISTS pompon boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_infos.pompon IS
  'Si true, lundi PWA demande la présence des pompons à l''ouverture.';

ALTER TABLE public.daily_info
  ADD COLUMN IF NOT EXISTS pompon boolean;

COMMENT ON COLUMN public.daily_info.pompon IS
  'Réponse ouverture (lundi, sites configurés) : pompons présents.';

-- Liste initiale (évolutive via CRM Manèges).
UPDATE public.site_infos si
SET pompon = true
FROM public.site s
WHERE si.site_id = s.id
  AND s.name IN ('BDV CARRÉ', 'BON MARCHE', 'NOGENT', 'SCEAUX');

INSERT INTO public.site_infos (site_id, pompon)
SELECT s.id, true
FROM public.site s
WHERE s.name IN ('BDV CARRÉ', 'BON MARCHE', 'NOGENT', 'SCEAUX')
  AND NOT EXISTS (
    SELECT 1 FROM public.site_infos si WHERE si.site_id = s.id
  );
