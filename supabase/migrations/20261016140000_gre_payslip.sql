-- Fiches de paie PDF (CRM upload admin, lecture PWA employé).
-- Bucket privé `payslips` : path `{user_id}/{YYYY-MM}.pdf`, jamais d'URL publique.

create table if not exists public.payslip (
  id serial primary key,
  user_id integer not null references public."user"(id) on delete cascade,
  period date not null,
  file_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payslip_period_first_of_month check (period = date_trunc('month', period)::date),
  constraint payslip_user_period_unique unique (user_id, period)
);

comment on table public.payslip is
  'Fiche de paie PDF par employé × mois. Path Storage bucket payslips.';
comment on column public.payslip.period is
  'Premier jour du mois couvert (ex. 2026-10-01).';
comment on column public.payslip.file_path is
  'Path Storage (bucket payslips). Jamais une URL publique.';

create index if not exists payslip_user_id_period_idx
  on public.payslip (user_id, period desc);

alter table public.payslip enable row level security;

drop policy if exists "payslip admin all" on public.payslip;
create policy "payslip admin all"
  on public.payslip
  for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "payslip employee select own" on public.payslip;
create policy "payslip employee select own"
  on public.payslip
  for select
  to authenticated
  using (user_id = (select public.current_employee_id()));

grant select, insert, update, delete on public.payslip to authenticated;
grant usage, select on sequence public.payslip_id_seq to authenticated;

insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;

drop policy if exists "payslips admin all" on storage.objects;
create policy "payslips admin all"
  on storage.objects
  for all
  using (bucket_id = 'payslips' and (select public.is_admin()))
  with check (bucket_id = 'payslips' and (select public.is_admin()));

drop policy if exists "payslips employee select own" on storage.objects;
create policy "payslips employee select own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payslips'
    and (storage.foldername(name))[1] = (select public.current_employee_id())::text
  );
