-- Zones Paris plus lisibles côté CRM (CA / EDT / Manèges / Staff / Messages) :
-- Paris Nord → Zone Nord, Paris Sud → Zone Sud.
-- Reclassement Intra Muros → Nord/Sud pour BDV / Nogent / Vache Noire / Sceaux.

UPDATE public.groupe
SET name = 'Zone Nord'
WHERE name = 'Paris Nord';

UPDATE public.groupe
SET name = 'Zone Sud'
WHERE name = 'Paris Sud';

UPDATE public.site AS s
SET group_id = g.id
FROM public.groupe AS g
WHERE g.name = 'Zone Nord'
  AND s.name IN ('BDV CARRÉ', 'BDV ROND', 'NOGENT SUR MARNE');

UPDATE public.site AS s
SET group_id = g.id
FROM public.groupe AS g
WHERE g.name = 'Zone Sud'
  AND s.name IN ('LA VACHE NOIRE', 'SCEAUX');
