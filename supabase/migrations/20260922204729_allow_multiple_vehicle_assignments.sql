-- Permite que un mismo chofer o auxiliar tenga acceso operativo a más de una unidad.
begin;

alter table public.user_vehicle_assignments
  drop constraint if exists user_vehicle_assignments_pkey;

alter table public.user_vehicle_assignments
  add primary key (user_id, vehicle_id);

create or replace function public.record_vehicle_odometer(target_vehicle_id uuid, odometer numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_vehicle public.vehicles%rowtype;
  allowed boolean;
begin
  if not public.is_active_user() then
    raise exception 'Usuario inactivo';
  end if;

  if not public.has_app_role(array['Chofer','Auxiliar','Administrador']) then
    raise exception 'Rol no autorizado';
  end if;

  select
    public.has_app_role(array['Administrador'])
    or exists (
      select 1
      from public.user_vehicle_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.vehicle_id = target_vehicle_id
        and assignment.active = true
    )
    or exists (
      select 1
      from public.service_assignments assignment
      join public.services service on service.id = assignment.service_id
      where assignment.user_id = auth.uid()
        and service.vehicle_id = target_vehicle_id
    )
  into allowed;

  if not allowed then
    raise exception 'Esta unidad no está asignada a tu cuenta. Solicita acceso a administración.';
  end if;

  select *
  into current_vehicle
  from public.vehicles
  where id = target_vehicle_id
    and active = true
  for update;

  if not found then
    raise exception 'Unidad no encontrada';
  end if;

  if odometer is null or odometer < current_vehicle.current_km then
    raise exception 'El kilometraje no puede ser menor al último registrado (% km)', current_vehicle.current_km;
  end if;

  insert into public.vehicle_odometer_entries (vehicle_id, user_id, odometer)
  values (target_vehicle_id, auth.uid(), odometer);

  update public.vehicles
  set current_km = odometer,
      updated_at = now()
  where id = target_vehicle_id;
end;
$$;

revoke all on function public.record_vehicle_odometer(uuid, numeric) from public, anon;
grant execute on function public.record_vehicle_odometer(uuid, numeric) to authenticated;

commit;
