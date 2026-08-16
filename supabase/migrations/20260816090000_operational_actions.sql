-- Acciones del portal operativo. Ejecutar después de 20260816050000_operational_core.sql.
begin;

create or replace function public.record_service_progress(
  target_service_id uuid,
  new_status text default null,
  odometer numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_service public.services%rowtype;
  allowed boolean;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo'; end if;

  select * into current_service from public.services where id = target_service_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;

  allowed := public.has_app_role(array['Propietario','Administrador','Coordinador']) or exists (
    select 1 from public.service_assignments
    where service_id = target_service_id and user_id = auth.uid()
  );
  if not allowed then raise exception 'No estás asignado a este servicio'; end if;
  if new_status is not null and new_status not in ('Confirmado','En ruta','Completado') then raise exception 'Estado no permitido'; end if;
  if odometer is not null and odometer < 0 then raise exception 'Kilometraje no válido'; end if;
  if odometer is not null and current_service.km_start is not null and odometer < current_service.km_start then raise exception 'El kilometraje no puede disminuir'; end if;

  update public.services set
    status = coalesce(new_status, status),
    km_start = case when odometer is not null and km_start is null then odometer else km_start end,
    km_end = case when odometer is not null and (new_status = 'Completado' or km_start is not null) then odometer else km_end end,
    updated_at = now()
  where id = target_service_id;

  if odometer is not null and current_service.vehicle_id is not null then
    update public.vehicles set current_km = greatest(current_km, odometer), updated_at = now()
    where id = current_service.vehicle_id;
  end if;
end;
$$;

revoke all on function public.record_service_progress(uuid,text,numeric) from public, anon;
grant execute on function public.record_service_progress(uuid,text,numeric) to authenticated;

commit;
