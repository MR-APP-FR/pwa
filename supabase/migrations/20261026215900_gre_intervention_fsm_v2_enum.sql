-- Enum values séparés (ADD VALUE hors transaction mêlée aux usages).
ALTER TYPE public.intervention_status ADD VALUE IF NOT EXISTS 'en_cours';
ALTER TYPE public.intervention_status ADD VALUE IF NOT EXISTS 'en_pause';
ALTER TYPE public.intervention_status ADD VALUE IF NOT EXISTS 'en_attente';
