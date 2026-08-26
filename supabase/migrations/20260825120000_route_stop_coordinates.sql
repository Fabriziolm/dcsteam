-- Coordenadas de entrega para identificación de locales y optimización de rutas.
begin;
alter table public.services
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;
alter table public.services drop constraint if exists services_destination_coordinates_check;
alter table public.services add constraint services_destination_coordinates_check check (
  (destination_lat is null and destination_lng is null)
  or (destination_lat between -90 and 90 and destination_lng between -180 and 180)
);
commit;
