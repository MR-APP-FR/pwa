-- Fiche staff papier : Statut familial en 3 cases (Fréquente / Mariée-Divorcée / Des enfants).
-- Conserve user_info.famille (texte libre historique) ; les 3 colonnes sont le nouveau contrat UI.

ALTER TABLE public.user_info
  ADD COLUMN IF NOT EXISTS famille_frequente text,
  ADD COLUMN IF NOT EXISTS famille_mariee_divorcee text,
  ADD COLUMN IF NOT EXISTS famille_enfants text;

COMMENT ON COLUMN public.user_info.famille_frequente IS
  'Statut familial — Fréquente (texte libre).';
COMMENT ON COLUMN public.user_info.famille_mariee_divorcee IS
  'Statut familial — Mariée / Divorcée (texte libre).';
COMMENT ON COLUMN public.user_info.famille_enfants IS
  'Statut familial — Des enfants (texte libre).';

UPDATE public.user_info
SET
  famille_frequente = CASE
    WHEN famille ~* 'fréquen' THEN trim(famille)
    ELSE famille_frequente
  END,
  famille_mariee_divorcee = CASE
    WHEN famille ~* 'mari|divorc|célib|celib' THEN trim(famille)
    WHEN famille !~* 'fréquen' AND famille !~* 'enfant' AND nullif(trim(famille), '') IS NOT NULL
      THEN trim(famille)
    ELSE famille_mariee_divorcee
  END,
  famille_enfants = CASE
    WHEN famille ~* 'enfant' THEN trim(famille)
    ELSE famille_enfants
  END
WHERE nullif(trim(famille), '') IS NOT NULL;

-- Qui sait lire sait aussi écrire et compter (cases papier non renseignées).
UPDATE public.user_info
SET
  sait_ecrire = true,
  sait_compter = true
WHERE sait_lire IS TRUE
  AND (sait_ecrire IS DISTINCT FROM true OR sait_compter IS DISTINCT FROM true);
