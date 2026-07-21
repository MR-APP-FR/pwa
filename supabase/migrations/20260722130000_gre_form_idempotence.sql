-- Étape 3 du cadrage prod PWA (cf. pwa/docs/CADRAGE-PROD-PWA.md).
-- Idempotence des formulaires ouverture/fermeture : une seule soumission par
-- (site, jour, employé). Un renvoi (correction) met à jour la ligne existante
-- via upsert (onConflict) au lieu de créer un doublon.
--
-- NB : daily_info N'A VOLONTAIREMENT PAS de contrainte d'unicité — l'ouverture
-- ET la fermeture y écrivent des lignes distinctes (nettoyage/pannes ouverture
-- vs pannes de fin de journée), c'est un journal multi-lignes par mission.

ALTER TABLE public.opening_form
  ADD CONSTRAINT opening_form_site_date_user_unique UNIQUE (site_id, date, user_id);

ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_site_date_user_unique UNIQUE (site_id, date, user_id);

-- L'upsert déclenche un UPDATE en cas de renvoi : opening_form/closing_form
-- n'avaient que des policies INSERT/SELECT (l'insert seul suffisait avant
-- l'idempotence). Policies UPDATE symétriques à celles d'`availability`.

GRANT UPDATE ON public.opening_form TO anon, authenticated;
GRANT UPDATE ON public.closing_form TO anon, authenticated;

CREATE POLICY "opening_form employee update own" ON public.opening_form
  FOR UPDATE TO authenticated
  USING (user_id = current_employee_id())
  WITH CHECK (user_id = current_employee_id());

-- ⚠️ MODE DÉMO (clé anon) — à SUPPRIMER à l'étape 5 (auth réelle, GRE-54/88/90).
CREATE POLICY "pwa demo anon update opening_form" ON public.opening_form
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "closing_form employee update own" ON public.closing_form
  FOR UPDATE TO authenticated
  USING (user_id = current_employee_id())
  WITH CHECK (user_id = current_employee_id());

-- ⚠️ MODE DÉMO (clé anon) — à SUPPRIMER à l'étape 5 (auth réelle, GRE-54/88/90).
CREATE POLICY "pwa demo anon update closing_form" ON public.closing_form
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
