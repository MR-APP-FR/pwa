-- Photo de profil staff + upload CNI / avatar depuis la PWA (RLS employé).
-- Le bucket `staff-documents` reste privé : path `{user_id}/…`, jamais d'URL publique.

alter table public.user_info
  add column if not exists avatar_url text;

comment on column public.user_info.avatar_url is
  'Path Storage (bucket staff-documents) de la photo de profil. Jamais une URL publique.';

comment on column public.user_info.cni_url is
  'Path Storage (bucket staff-documents) du scan CNI. Jamais une URL publique.';

-- Employé : lecture / écriture / remplacement de SON dossier uniquement.
-- Upsert storage = INSERT + SELECT + UPDATE (audit skill Supabase).
drop policy if exists "staff-documents employee select own" on storage.objects;
create policy "staff-documents employee select own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1] = (select public.current_employee_id())::text
);

drop policy if exists "staff-documents employee insert own" on storage.objects;
create policy "staff-documents employee insert own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1] = (select public.current_employee_id())::text
);

drop policy if exists "staff-documents employee update own" on storage.objects;
create policy "staff-documents employee update own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1] = (select public.current_employee_id())::text
)
with check (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1] = (select public.current_employee_id())::text
);

drop policy if exists "staff-documents employee delete own" on storage.objects;
create policy "staff-documents employee delete own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1] = (select public.current_employee_id())::text
);
