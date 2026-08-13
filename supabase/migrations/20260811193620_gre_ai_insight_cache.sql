create table public.ai_insight (
  id bigint generated always as identity primary key,
  scope text not null,
  scope_key text not null,
  input_hash text not null,
  prompt_version int not null default 1,
  content text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (scope, scope_key, input_hash, prompt_version)
);

alter table public.ai_insight enable row level security;

create policy "ai_insight admin all" on public.ai_insight
  for all using (is_admin()) with check (is_admin());
