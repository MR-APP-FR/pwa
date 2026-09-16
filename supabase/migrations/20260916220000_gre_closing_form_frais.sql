-- Frais divers sortis de la caisse (espèces), déduits du calcul enveloppe.
-- Justification obligatoire si montant > 0.

ALTER TABLE public.closing_form
  ADD COLUMN IF NOT EXISTS frais numeric,
  ADD COLUMN IF NOT EXISTS frais_raison text;

COMMENT ON COLUMN public.closing_form.frais IS
  'Frais divers sortis de la caisse (espèces), déduits du calcul enveloppe.';
COMMENT ON COLUMN public.closing_form.frais_raison IS
  'Justification obligatoire si frais > 0.';

ALTER TABLE public.closing_form
  DROP CONSTRAINT IF EXISTS closing_form_frais_non_negative;
ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_frais_non_negative
  CHECK (frais IS NULL OR frais >= 0);

ALTER TABLE public.closing_form
  DROP CONSTRAINT IF EXISTS closing_form_frais_raison_when_frais;
ALTER TABLE public.closing_form
  ADD CONSTRAINT closing_form_frais_raison_when_frais
  CHECK (
    frais IS NULL
    OR frais = 0
    OR (frais_raison IS NOT NULL AND length(btrim(frais_raison)) > 0)
  );
