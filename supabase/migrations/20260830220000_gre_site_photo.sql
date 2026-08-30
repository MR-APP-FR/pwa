-- Photo de référence du manège (CRM fiche). Path Storage, jamais d’URL publique.
alter table public.site
  add column if not exists photo_url text;

comment on column public.site.photo_url is
  'Path Storage (bucket site-photos) — photo du manège. Jamais une URL publique.';

insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', false)
on conflict (id) do nothing;

drop policy if exists "site-photos admin all" on storage.objects;
create policy "site-photos admin all" on storage.objects
  for all using (bucket_id = 'site-photos' and is_admin())
  with check (bucket_id = 'site-photos' and is_admin());

drop policy if exists "site-photos authenticated select" on storage.objects;
create policy "site-photos authenticated select" on storage.objects
  for select using (bucket_id = 'site-photos' and auth.role() = 'authenticated');
