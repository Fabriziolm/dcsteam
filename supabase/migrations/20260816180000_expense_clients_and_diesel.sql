-- DCS: gastos directos por cliente y unidad, sin depender de un servicio.
begin;

alter table public.expenses
add column if not exists client_id uuid references public.clients(id);

create index if not exists expenses_client_idx on public.expenses (client_id);

alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check
check (category in (
  'Gasolina','Petróleo','GLP','Peaje','Estacionamiento','Mantenimiento',
  'Pago personal','Impuesto','Otro'
));

insert into public.clients (name)
select requested.name
from (values
  ('Indurama'),
  ('Quiminap'),
  ('Thaniyay'),
  ('DAR'),
  ('Healing'),
  ('ROE'),
  ('Calderon'),
  ('Mondelez'),
  ('INVERSIONES M K & F SAC')
) as requested(name)
where not exists (
  select 1 from public.clients existing
  where lower(trim(existing.name)) = lower(trim(requested.name))
);

commit;
