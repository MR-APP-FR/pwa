-- Rattrapage CA : tous les messages canal `ca` (même sans meta.kind).
-- Titre « 📈 CA du jour », corps vide, meta.kind + date garantis (carte PDF CRM).

UPDATE public.staff_message
SET
  titre = '📈 CA du jour',
  corps = '',
  meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
    'kind', 'ca_daily_pdf',
    'date', COALESCE(
      NULLIF(meta->>'date', ''),
      to_char((publie_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD')
    )
  )
WHERE channel = 'ca'
  AND (
    titre IS DISTINCT FROM '📈 CA du jour'
    OR corps IS DISTINCT FROM ''
    OR meta IS NULL
    OR COALESCE(meta->>'kind', '') IS DISTINCT FROM 'ca_daily_pdf'
    OR COALESCE(meta->>'date', '') = ''
  );
