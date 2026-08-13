-- TAVERNY (id 301) : rattacher à la zone Paris Sud.
-- Idempotent : ne touche que si le site est encore sans groupe.

UPDATE public.site
SET group_id = 3
WHERE id = 301 AND name = 'TAVERNY' AND group_id IS NULL;
