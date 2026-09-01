-- Endurece funciones privilegiadas expuestas por el esquema public.
-- Los triggers no necesitan permisos EXECUTE del cliente: PostgreSQL los invoca
-- internamente al ejecutar la operación que los dispara.

alter function public.capture_attendance_correction_originals()
  set search_path = '';
alter function public.sync_service_invoiced()
  set search_path = '';

revoke execute on function public.capture_attendance_correction_originals()
  from public, anon, authenticated;
revoke execute on function public.sync_service_invoiced()
  from public, anon, authenticated;

-- Las nuevas funciones del esquema expuesto no deben quedar ejecutables por
-- cualquier visitante por el grant PUBLIC que PostgreSQL aplica por defecto.
alter default privileges in schema public
  revoke execute on functions from public, anon;

