-- GRE-87 : liste des employés actifs pour le profile switcher PWA (mode démo).
-- Contourne RLS via SECURITY DEFINER pour les clients anon (iOS PWA en prod).

CREATE OR REPLACE FUNCTION public.get_demo_employees()
RETURNS TABLE (
  id integer,
  login text,
  email text,
  fullname text,
  actif boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.login, u.email, u.fullname, u.actif
  FROM public."user" u
  WHERE COALESCE(u.actif, true) = true
  ORDER BY u.fullname NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_demo_employees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_employees() TO anon, authenticated;
