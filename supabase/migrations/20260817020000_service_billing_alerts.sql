-- Relaciona cada factura con el servicio que la originó y mantiene la alerta
-- de cierre hasta que exista una factura válida para ese servicio.
alter table public.invoices
  add column if not exists service_id uuid references public.services(id) on delete set null;

alter table public.services
  add column if not exists billing_remind_at timestamptz;

create unique index if not exists invoices_service_id_idx
  on public.invoices(service_id)
  where service_id is not null and status <> 'Anulada';

create or replace function public.sync_service_invoiced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_service uuid;
begin
  affected_service := case when tg_op = 'DELETE' then old.service_id else new.service_id end;

  if affected_service is not null then
    update public.services
    set invoiced = exists (
      select 1
      from public.invoices
      where service_id = affected_service
        and status <> 'Anulada'
    ), billing_remind_at = null, updated_at = now()
    where id = affected_service;
  end if;

  if tg_op = 'UPDATE' and old.service_id is distinct from new.service_id and old.service_id is not null then
    update public.services
    set invoiced = exists (
      select 1
      from public.invoices
      where service_id = old.service_id
        and status <> 'Anulada'
    ), billing_remind_at = null, updated_at = now()
    where id = old.service_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_sync_service_invoiced on public.invoices;
create trigger invoices_sync_service_invoiced
after insert or update of service_id, status or delete on public.invoices
for each row execute function public.sync_service_invoiced();

-- Activa las alertas también para servicios históricos que aún no tienen factura.
update public.services s
set invoiced = exists (
  select 1 from public.invoices i
  where i.service_id = s.id and i.status <> 'Anulada'
)
where s.status = 'Completado';
