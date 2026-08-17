-- Movimientos de caja importados de la hoja canónica Entradas y Salidas.
begin;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  movement_date date not null,
  movement_type text not null check (movement_type in ('Ingreso','Egreso')),
  concept text not null,
  amount numeric(12,2) not null check (amount > 0),
  source_system text not null default 'google_sheets',
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_system, source_key)
);

create index if not exists cash_movements_date_idx
  on public.cash_movements(movement_date desc);

alter table public.cash_movements enable row level security;
alter table public.cash_movements force row level security;
revoke all on public.cash_movements from anon;
grant select on public.cash_movements to authenticated;

drop policy if exists cash_movements_admin_read on public.cash_movements;
create policy cash_movements_admin_read on public.cash_movements
for select to authenticated
using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

create table if not exists public.sheet_sync_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('Ejecutando','Correcta','Error')),
  services_count integer not null default 0,
  invoices_count integer not null default 0,
  cash_count integer not null default 0,
  detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.sheet_sync_runs enable row level security;
alter table public.sheet_sync_runs force row level security;
revoke all on public.sheet_sync_runs from anon;
grant select on public.sheet_sync_runs to authenticated;

drop policy if exists sheet_sync_runs_admin_read on public.sheet_sync_runs;
create policy sheet_sync_runs_admin_read on public.sheet_sync_runs
for select to authenticated
using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

create or replace function public.prune_google_sheet_rows(
  service_keys text[], invoice_keys text[], cash_keys text[]
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.expenses
  where source_system = 'google_sheets'
    and split_part(source_key, ':', 1) = 'transport'
    and not (split_part(source_key, ':', 1) || ':' || split_part(source_key, ':', 2) = any(service_keys));
  delete from public.service_assignments
  where service_id in (
    select id from public.services
    where source_system = 'google_sheets' and not (source_key = any(service_keys))
  );
  delete from public.services
  where source_system = 'google_sheets' and not (source_key = any(service_keys));
  delete from public.invoices
  where source_system = 'google_sheets' and not (source_key = any(invoice_keys));
  delete from public.cash_movements
  where source_system = 'google_sheets' and not (source_key = any(cash_keys));
end;
$$;
revoke all on function public.prune_google_sheet_rows(text[],text[],text[]) from public, anon, authenticated;

commit;
