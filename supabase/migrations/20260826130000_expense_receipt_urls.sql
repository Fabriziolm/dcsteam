-- Permite conservar hasta diez comprobantes por gasto, manteniendo receipt_url como primer comprobante.
begin;
alter table public.expenses add column if not exists receipt_urls text[] not null default '{}';
commit;
