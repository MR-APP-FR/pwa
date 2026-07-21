-- Étape 1 du cadrage prod PWA (cf. pwa/docs/CADRAGE-PROD-PWA.md).
-- Persiste les disponibilités saisies dans /availability (auparavant local-only).
--
-- Clé métier : (user_id, date) -> une seule réponse par employé et par jour,
-- ce qui rend le submit idempotent (upsert onConflict côté server action).
--
-- RLS calquée EXACTEMENT sur opening_form / closing_form / daily_info :
--   - policies "employee" auth-ready basées sur current_employee_id() / is_admin()
--   - policies "pwa demo anon" temporaires (mode démo, clé anon) à SUPPRIMER
--     à l'étape 5 du cadrage (auth réelle). Différence : availability fait un
--     upsert => on ajoute une policy UPDATE que les tables insert-only n'ont pas.

CREATE TABLE IF NOT EXISTS public.availability (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  date         date NOT NULL,
  available    boolean NOT NULL,
  note         text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_user_date_unique UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS availability_date_idx ON public.availability (date);

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.availability TO anon, authenticated;

-- Admin (dashboard) : accès total.
CREATE POLICY "availability admin all" ON public.availability
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Employé authentifié : lit / écrit uniquement ses propres disponibilités.
CREATE POLICY "availability employee select own" ON public.availability
  FOR SELECT TO authenticated USING (user_id = current_employee_id());

CREATE POLICY "availability employee insert own" ON public.availability
  FOR INSERT TO authenticated WITH CHECK (user_id = current_employee_id());

CREATE POLICY "availability employee update own" ON public.availability
  FOR UPDATE TO authenticated
  USING (user_id = current_employee_id())
  WITH CHECK (user_id = current_employee_id());

-- ⚠️ MODE DÉMO (clé anon) — à SUPPRIMER à l'étape 5 (auth réelle, GRE-54/88/90).
CREATE POLICY "pwa demo anon select availability" ON public.availability
  FOR SELECT TO anon USING (true);

CREATE POLICY "pwa demo anon insert availability" ON public.availability
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "pwa demo anon update availability" ON public.availability
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
