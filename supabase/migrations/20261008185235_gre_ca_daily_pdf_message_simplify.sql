-- Messages CA : titre « 📈 CA du jour » + carte PDF seulement (corps vide).
-- (Complété par 20261008191000_gre_ca_daily_pdf_backfill_all pour les rows sans meta.kind.)
UPDATE public.staff_message
SET
  titre = '📈 CA du jour',
  corps = ''
WHERE channel = 'ca'
  AND meta->>'kind' = 'ca_daily_pdf'
  AND (
    titre IS DISTINCT FROM '📈 CA du jour'
    OR corps IS DISTINCT FROM ''
  );
