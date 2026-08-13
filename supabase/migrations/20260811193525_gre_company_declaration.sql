create table public.company (
  id integer generated always as identity primary key,
  name text not null,
  siret text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.company enable row level security;

create policy "company employee select" on public.company
  for select using (true);

create policy "company admin all" on public.company
  for all using (is_admin()) with check (is_admin());

alter table public.user_info
  add column company_id integer references public.company(id),
  add column declared_at date;
