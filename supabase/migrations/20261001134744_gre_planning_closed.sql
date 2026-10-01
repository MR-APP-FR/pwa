-- Case planning site × jour fermée (pas d’affectation, auto-fill ignore).
ALTER TABLE public.planning
  ADD COLUMN IF NOT EXISTS closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.planning
  DROP CONSTRAINT IF EXISTS planning_closed_implies_no_staff;

ALTER TABLE public.planning
  ADD CONSTRAINT planning_closed_implies_no_staff
  CHECK (NOT closed OR (user_id IS NULL AND double_id IS NULL));

COMMENT ON COLUMN public.planning.closed IS
  'Site volontairement fermé ce jour (CRM planning) ; pas de teneur/double.';
