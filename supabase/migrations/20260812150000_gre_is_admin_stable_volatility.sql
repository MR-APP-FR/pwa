-- is_admin() est appelée dans les policies RLS de nombreuses tables (data, planning, ...).
-- Marquée VOLATILE (défaut plpgsql), Postgres ne peut pas la hisser en InitPlan (filtre
-- évalué une seule fois) : elle est ré-exécutée (sous-requête sur user_roles incluse) pour
-- CHAQUE ligne scannée, ce qui provoque des timeouts sur les tables de plusieurs dizaines
-- de milliers de lignes (ex: getStaffPerformance() sur `planning`/`data`).
-- La fonction est un pur SELECT sans écriture : STABLE est la catégorie correcte.
ALTER FUNCTION public.is_admin(uuid) STABLE;
