-- L'admin CRM écrit via le rôle authenticated. RLS limite l'écriture à is_admin().

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_day_hours TO authenticated;
