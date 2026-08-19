-- Abonnements Web Push de la PWA (un endpoint = un appareil).
-- Écrit par l'employé via upsert_push_subscription ; lu par le CRM pour l'envoi.

create table public.push_subscription (
  id bigint generated always as identity primary key,
  user_id integer not null references public.user (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscription_endpoint_key unique (endpoint)
);

create index push_subscription_user_id_idx on public.push_subscription (user_id);

comment on table public.push_subscription is
  'Abonnements Web Push PWA. Unique par endpoint (appareil) ; réassigné si un autre employé se connecte.';

alter table public.push_subscription enable row level security;

revoke all on table public.push_subscription from anon, public;
grant select, insert, update, delete on table public.push_subscription to authenticated;

create policy "push_subscription select admin_or_own"
  on public.push_subscription
  for select to authenticated
  using (
    (select public.is_admin())
    or user_id = (select public.current_employee_id())
  );

create policy "push_subscription employee insert own"
  on public.push_subscription
  for insert to authenticated
  with check (user_id = (select public.current_employee_id()));

create policy "push_subscription employee update own"
  on public.push_subscription
  for update to authenticated
  using (user_id = (select public.current_employee_id()))
  with check (user_id = (select public.current_employee_id()));

create policy "push_subscription employee delete own"
  on public.push_subscription
  for delete to authenticated
  using (user_id = (select public.current_employee_id()));

create policy "push_subscription admin delete"
  on public.push_subscription
  for delete to authenticated
  using ((select public.is_admin()));

create function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid integer;
begin
  uid := public.current_employee_id();
  if uid is null or uid <= 0 then
    raise exception 'not an employee';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 or p_endpoint not like 'https://%' then
    raise exception 'invalid endpoint';
  end if;
  if p_p256dh is null or p_auth is null or length(p_p256dh) < 8 or length(p_auth) < 8 then
    raise exception 'invalid keys';
  end if;

  insert into public.push_subscription (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
