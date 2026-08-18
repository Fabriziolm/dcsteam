begin;

create table if not exists public.vehicle_odometer_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  odometer numeric(12,2) not null check (odometer >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists vehicle_odometer_entries_vehicle_date_idx on public.vehicle_odometer_entries(vehicle_id,recorded_at desc);
alter table public.vehicle_odometer_entries enable row level security;
alter table public.vehicle_odometer_entries force row level security;
revoke all on public.vehicle_odometer_entries from anon;
grant select on public.vehicle_odometer_entries to authenticated;

create policy vehicle_odometer_read on public.vehicle_odometer_entries
for select to authenticated
using (public.is_active_user() and (user_id=auth.uid() or public.has_app_role(array['Administrador'])));

create or replace function public.record_vehicle_odometer(target_vehicle_id uuid,odometer numeric)
returns void language plpgsql security definer set search_path='' as $$
declare current_vehicle public.vehicles%rowtype;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo'; end if;
  if not public.has_app_role(array['Chofer','Auxiliar','Administrador']) then raise exception 'Rol no autorizado'; end if;
  select * into current_vehicle from public.vehicles where id=target_vehicle_id and active=true for update;
  if not found then raise exception 'Unidad no encontrada'; end if;
  if odometer is null or odometer<current_vehicle.current_km then raise exception 'El kilometraje no puede ser menor al último registrado (% km)',current_vehicle.current_km; end if;
  insert into public.vehicle_odometer_entries(vehicle_id,user_id,odometer) values(target_vehicle_id,auth.uid(),odometer);
  update public.vehicles set current_km=odometer,updated_at=now() where id=target_vehicle_id;
end;
$$;
revoke all on function public.record_vehicle_odometer(uuid,numeric) from public,anon;
grant execute on function public.record_vehicle_odometer(uuid,numeric) to authenticated;

commit;
