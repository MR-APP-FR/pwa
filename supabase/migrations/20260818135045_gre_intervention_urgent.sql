-- Urgent en vrai champ (plus de préfixe dans le texte).
-- a_planifier est replié sur signalee : l’UI n’expose plus que
-- Ouverte (signalee) / Programmé (planifiee) / Terminé (cloturee).

ALTER TABLE public.intervention
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.intervention.urgent IS
  'Priorité bureau : ticket urgent ou non.';

UPDATE public.intervention
SET status = 'signalee'
WHERE status = 'a_planifier';
