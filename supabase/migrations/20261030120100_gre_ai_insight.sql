-- Evolve public.ai_insight (créée 20260811) pour cache LLM + UI CRM.
-- scope = kind métier (ex. ca_daily_digest) ; scope_key = clé stable (ex. date ISO).
-- input_hash = empreinte du snapshot d'entrée → régénération si données changent.

ALTER TABLE public.ai_insight
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS prompt_tokens int,
  ADD COLUMN IF NOT EXISTS completion_tokens int,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ai_insight
  DROP CONSTRAINT IF EXISTS ai_insight_status_check;

ALTER TABLE public.ai_insight
  ADD CONSTRAINT ai_insight_status_check
  CHECK (status IN ('pending', 'ready', 'error'));

COMMENT ON TABLE public.ai_insight IS
  'Cache insights LLM (LiteLLM / Foundry). Admin RLS ; écriture Edge service role.';
COMMENT ON COLUMN public.ai_insight.scope IS 'Kind métier : ca_daily_digest, closing_vision_seau, …';
COMMENT ON COLUMN public.ai_insight.scope_key IS 'Clé stable (date, site_id:date, …)';
COMMENT ON COLUMN public.ai_insight.input_hash IS 'Hash du snapshot d''entrée ; change → nouvelle génération';
COMMENT ON COLUMN public.ai_insight.content IS 'Texte résumé affichable (messages / bandeau CRM)';
COMMENT ON COLUMN public.ai_insight.payload IS 'JSON structuré (outliers, flags vision, …)';

CREATE INDEX IF NOT EXISTS ai_insight_scope_key_idx
  ON public.ai_insight (scope, scope_key, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_insight_status_idx
  ON public.ai_insight (status)
  WHERE status <> 'ready';
