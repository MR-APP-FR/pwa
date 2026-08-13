create table public.suggestion_anonyme (
  id bigint generated always as identity primary key,
  corps text not null,
  categorie text,
  created_at timestamptz not null default now()
);

alter table public.suggestion_anonyme enable row level security;

create policy "suggestion_anonyme insert authenticated" on public.suggestion_anonyme
  for insert to authenticated with check (true);

create policy "suggestion_anonyme admin select" on public.suggestion_anonyme
  for select using (is_admin());

create function public.submit_suggestion_anonyme(corps text, categorie text default null)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.suggestion_anonyme (corps, categorie) values (corps, categorie);
$$;

grant execute on function public.submit_suggestion_anonyme(text, text) to authenticated;
