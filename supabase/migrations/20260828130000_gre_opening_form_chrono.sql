ALTER TABLE public.opening_form
  ADD COLUMN IF NOT EXISTS chrono_seconds integer NULL;

ALTER TABLE public.opening_form
  DROP CONSTRAINT IF EXISTS opening_form_chrono_seconds_range;

ALTER TABLE public.opening_form
  ADD CONSTRAINT opening_form_chrono_seconds_range
  CHECK (chrono_seconds IS NULL OR (chrono_seconds >= 0 AND chrono_seconds <= 5999));

COMMENT ON COLUMN public.opening_form.chrono_seconds IS
  'Durée chrono (mercredi) en secondes totales (minutes × 60 + secondes).';
