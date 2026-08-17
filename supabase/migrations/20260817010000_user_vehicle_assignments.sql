-- DCS: unidad operativa asignada a cada chofer o auxiliar.
begin;

create table if not exists public.user_vehicle_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_vehicle_assignments enable row level security;
alter table public.user_vehicle_assignments force row level security;
revoke all on public.user_vehicle_assignments from anon;
grant select,insert,update,delete on public.user_vehicle_assignments to authenticated;

drop policy if exists user_vehicle_read on public.user_vehicle_assignments;
create policy user_vehicle_read on public.user_vehicle_assignments for select to authenticated
using (public.is_active_user() and (user_id=auth.uid() or public.has_app_role(array['Administrador'])));

drop policy if exists user_vehicle_manage on public.user_vehicle_assignments;
create policy user_vehicle_manage on public.user_vehicle_assignments for all to authenticated
using (public.is_active_user() and public.has_app_role(array['Administrador']))
with check (public.is_active_user() and public.has_app_role(array['Administrador']));

-- La base de datos también impide registrar un gasto contra otra unidad.
drop policy if exists expenses_insert_own on public.expenses;
create policy expenses_insert_own on public.expenses for insert to authenticated
with check (
  public.is_active_user()
  and user_id=auth.uid()
  and status='Pendiente'
  and exists (
    select 1 from public.user_vehicle_assignments assignment
    where assignment.user_id=auth.uid()
      and assignment.vehicle_id=expenses.vehicle_id
      and assignment.active=true
  )
);

commit;
