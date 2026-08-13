alter table public.user_info
  add column cni_numero text,
  add column cni_url text;

insert into storage.buckets (id, name, public)
values ('staff-documents', 'staff-documents', false)
on conflict (id) do nothing;

create policy "staff-documents admin all" on storage.objects
  for all using (bucket_id = 'staff-documents' and is_admin())
  with check (bucket_id = 'staff-documents' and is_admin());
