create table public.staff_message (
  id bigint generated always as identity primary key,
  titre text not null,
  corps text not null,
  source text not null default 'bureau' check (source in ('bureau','appli')),
  auteur_uuid uuid references auth.users(id),
  site_ids int[] not null default '{}',
  user_ids int[] not null default '{}',
  require_ack boolean not null default false,
  publie_at timestamptz not null default now(),
  expire_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.staff_message_ack (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.staff_message(id) on delete cascade,
  user_id integer not null references public.user(id),
  read_at timestamptz,
  acked_at timestamptz,
  unique (message_id, user_id)
);

alter table public.staff_message enable row level security;
alter table public.staff_message_ack enable row level security;

create policy "staff_message admin all" on public.staff_message
  for all using (is_admin()) with check (is_admin());

create policy "staff_message employee select targeted" on public.staff_message
  for select using (
    (site_ids = '{}' and user_ids = '{}')
    or current_employee_id() = any(user_ids)
    or exists (
      select 1 from public.planning p
      where (p.user_id = current_employee_id() or p.double_id = current_employee_id())
        and p.site_id = any(staff_message.site_ids)
        and p.year = extract(year from current_date)::int
        and p.month = extract(month from current_date)::int
        and p.day = extract(day from current_date)::int
    )
  );

create policy "staff_message_ack admin all" on public.staff_message_ack
  for all using (is_admin()) with check (is_admin());

create policy "staff_message_ack employee select own" on public.staff_message_ack
  for select using (user_id = current_employee_id());

create policy "staff_message_ack employee insert own" on public.staff_message_ack
  for insert with check (user_id = current_employee_id());

create policy "staff_message_ack employee update own" on public.staff_message_ack
  for update using (user_id = current_employee_id()) with check (user_id = current_employee_id());
