-- Boîte à idées : statut « traité » côté CRM (conserve l'historique).
-- treated_at NULL = ouverte ; non NULL = traitée.

alter table public.suggestion_anonyme
  add column if not exists treated_at timestamptz null;

comment on column public.suggestion_anonyme.treated_at is
  'Rempli par un admin CRM quand l''idée est marquée traitée. NULL = ouverte.';

drop policy if exists "suggestion_anonyme admin update" on public.suggestion_anonyme;

create policy "suggestion_anonyme admin update"
on public.suggestion_anonyme
for update
to authenticated
using (is_admin())
with check (is_admin());
