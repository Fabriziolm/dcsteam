begin;

create table if not exists public.staff_alerts (
  id uuid primary key default gen_random_uuid(),
  target_role text not null check (target_role in ('Chofer', 'Auxiliar', 'Todos')),
  alert_mode text not null default 'both' check (alert_mode in ('vibration', 'sound', 'both')),
  message text not null check (char_length(btrim(message)) between 1 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index if not exists staff_alerts_created_at_idx
  on public.staff_alerts(created_at desc);

create index if not exists staff_alerts_created_by_idx
  on public.staff_alerts(created_by);

alter table public.staff_alerts enable row level security;
alter table public.staff_alerts force row level security;

revoke all on table public.staff_alerts from anon, authenticated;
grant select, insert on table public.staff_alerts to authenticated;

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
  )
);

drop policy if exists staff_alerts_send on public.staff_alerts;
create policy staff_alerts_send
on public.staff_alerts
for insert
to authenticated
with check (
  public.is_active_user()
  and public.has_app_role(array['Administrador'])
  and created_by = (select auth.uid())
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'staff_alerts'
    ) then
    alter publication supabase_realtime add table public.staff_alerts;
  end if;
end
$$;

commit;
