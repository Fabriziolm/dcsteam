-- Metadatos de bloques para observar y repetir sincronizaciones sin duplicar
-- la carga lógica. No cambia las tablas de negocio ni elimina datos.
alter table public.sheet_sync_runs
  add column if not exists sync_run_key text,
  add column if not exists chunk_index integer not null default 0,
  add column if not exists chunk_count integer not null default 1,
  add column if not exists sync_mode text not null default 'full',
  add column if not exists records_received integer not null default 0,
  add column if not exists duration_ms integer;

create unique index if not exists sheet_sync_runs_run_chunk_idx
  on public.sheet_sync_runs(sync_run_key, chunk_index)
  where sync_run_key is not null;

create index if not exists sheet_sync_runs_started_idx
  on public.sheet_sync_runs(started_at desc);

-- El endpoint nuevo conserva las tres listas originales y agrega saldos/horas.
-- La firma ampliada evita que el bloque final falle por una llamada RPC incompatible.
create or replace function public.prune_google_sheet_rows(
  service_keys text[], invoice_keys text[], cash_keys text[],
  cash_balance_keys text[] default '{}', work_hour_keys text[] default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.expenses
  where source_system = 'google_sheets'
    and split_part(source_key, ':', 1) = 'transport'
    and not (split_part(source_key, ':', 1) || ':' || split_part(source_key, ':', 2) = any(service_keys));
  delete from public.service_assignments
  where service_id in (select id from public.services where source_system = 'google_sheets' and not (source_key = any(service_keys)));
  delete from public.services where source_system = 'google_sheets' and not (source_key = any(service_keys));
  delete from public.invoices where source_system = 'google_sheets' and not (source_key = any(invoice_keys));
  delete from public.cash_movements where source_system = 'google_sheets' and not (source_key = any(cash_keys));
  delete from public.cash_balance_snapshots where source_system = 'google_sheets' and not (source_key = any(cash_balance_keys));
  delete from public.imported_work_hours where source_system = 'google_sheets' and not (source_key = any(work_hour_keys));
end;
$$;
