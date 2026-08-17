-- Cantidad real de paradas/puntos atendidos por servicio.
begin;
alter table public.services
  add column if not exists delivery_points integer not null default 1;
alter table public.services
  drop constraint if exists services_delivery_points_check;
alter table public.services
  add constraint services_delivery_points_check check (delivery_points > 0);
commit;
