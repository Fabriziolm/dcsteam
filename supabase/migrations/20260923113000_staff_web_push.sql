begin;

alter table public.staff_alerts
  add column if not exists target_user_ids uuid[];

alter table public.staff_alerts
  drop constraint if exists staff_alerts_target_role_check;

alter table public.staff_alerts
  add constraint staff_alerts_target_role_check
  check (target_role in ('Chofer', 'Auxiliar', 'Todos', 'Personas'));

create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  role text not null check (role in ('Chofer', 'Auxiliar')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists staff_push_subscriptions_user_idx
  on public.staff_push_subscriptions(user_id);

alter table public.staff_push_subscriptions enable row level security;
alter table public.staff_push_subscriptions force row level security;

revoke all on table public.staff_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.staff_push_subscriptions to authenticated;

drop policy if exists staff_push_subscriptions_own on public.staff_push_subscriptions;
create policy staff_push_subscriptions_own
on public.staff_push_subscriptions
for all
to authenticated
using (public.is_active_user() and user_id = (select auth.uid()))
with check (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists staff_alerts_read on public.staff_alerts;
create policy staff_alerts_read
on public.staff_alerts
for select
to authenticated
using (
  public.is_active_user()
  and (
    public.has_app_role(array['Administrador'])
    or target_role = 'Todos'
    or target_role = public.current_app_role()
    or (target_role = 'Personas' and (select auth.uid()) = any(coalesce(target_user_ids, '{}'::uuid[])))
  )
);

commit;
