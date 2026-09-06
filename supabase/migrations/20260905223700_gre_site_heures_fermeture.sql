-- Heure de fermeture par jour dans site_infos.heures_semaine (clé JSON `ferme`,
-- parallèle à `ouvre`), plus colonne legacy `heure_fermeture` (comme heure_ouverture).
-- Backfill initial : 20:05 partout (aligné échéance fermeture métier).

ALTER TABLE public.site_infos
  ADD COLUMN IF NOT EXISTS heure_fermeture time without time zone;

UPDATE public.site_infos
SET
  heure_fermeture = TIME '20:05:00',
  heures_semaine = (
    SELECT COALESCE(jsonb_object_agg(d.day_key, d.day_val), '{}'::jsonb)
    FROM (
      SELECT
        k::text AS day_key,
        COALESCE(heures_semaine -> (k::text), '{}'::jsonb)
          || jsonb_build_object('ferme', '20:05:00') AS day_val
      FROM generate_series(1, 7) AS k
    ) AS d
  ),
  updated_at = now();

COMMENT ON COLUMN public.site_infos.heure_fermeture IS
  'Heure de fermeture par défaut (legacy) ; la source de vérité par jour est heures_semaine.*.ferme';
