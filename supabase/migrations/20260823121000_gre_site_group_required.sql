-- Vider le seau « Autres » : rattacher les sites sans zone, puis interdire group_id NULL.

UPDATE public.site AS s
SET group_id = g.id
FROM public.groupe AS g
WHERE g.name = 'Paris Intra Muros'
  AND s.group_id IS NULL
  AND s.name IN ('SAINT SULPICE', 'LES ARCADES', 'SO OUEST', 'SAINT CLOUD');

UPDATE public.site AS s
SET group_id = g.id
FROM public.groupe AS g
WHERE g.name = 'Province'
  AND s.group_id IS NULL
  AND s.name = 'STEEL';

ALTER TABLE public.site
  ALTER COLUMN group_id SET NOT NULL;
