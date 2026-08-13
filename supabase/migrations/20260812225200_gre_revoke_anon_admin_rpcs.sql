-- Default privileges Supabase GRANT EXECUTE TO anon on new public functions.
-- Les RPC d'agrégation admin ne doivent pas être appelables sans session.
REVOKE ALL ON FUNCTION public.get_dashboard_ca(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_yearly_monthly_totals(integer) FROM anon;
REVOKE ALL ON FUNCTION public.sum_data_by_site(integer, integer, integer[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_performance(date, date) FROM anon;
