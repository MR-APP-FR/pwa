-- La notion "Déclaré / Non déclaré" (user_info.declaree) est retirée du produit,
-- remplacée par le statut On/Off existant (user_info.onoff). Backfill : tout le
-- monde qui était explicitement "non déclaré" (declaree = false) passe en Off.
-- Ne touche pas declaree IS NULL ni declaree = true (déjà cohérent avec onoff actuel).
UPDATE public.user_info
SET onoff = false
WHERE declaree = false
  AND onoff IS DISTINCT FROM false;
