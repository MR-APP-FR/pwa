-- Fix ouverture PWA : le trigger create_intervention_from_panne insère
-- intervention + intervention_event (kind created). Depuis FSM v2, l'event
-- n'est writable que par assignee / maintenance / admin → RLS bloque le teneur
-- qui valide l'ouverture avec des pannes (erreur daily_info).
-- SECURITY DEFINER : écriture système post-daily_info, comme resolve_pannes_*.

ALTER FUNCTION public.create_intervention_from_panne()
  SECURITY DEFINER
  SET search_path TO public;

COMMENT ON FUNCTION public.create_intervention_from_panne() IS
  'Après insert/update daily_info pannes : 1 ticket/sujet (+ autre). Dédup ouvert site×sujet ; event created. SECURITY DEFINER (bypass RLS event/update).';
