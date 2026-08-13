alter table public.site
  add column closing_checklist_items text[] not null default '{}';

alter table public.closing_form
  add column checklist jsonb not null default '{}',
  add column avis_google_count int not null default 0;
