begin;

create table if not exists public.cash_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  balance_date date not null,
  balance numeric(12,2) not null,
  label text not null,
  source_system text not null default 'google_sheets',
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_system, source_key)
);

create index if not exists cash_balance_snapshots_date_idx on public.cash_balance_snapshots(balance_date desc);
alter table public.cash_balance_snapshots enable row level security;
alter table public.cash_balance_snapshots force row level security;
revoke all on public.cash_balance_snapshots from anon;
grant select on public.cash_balance_snapshots to authenticated;

create policy cash_balance_snapshots_admin_read on public.cash_balance_snapshots
for select to authenticated
using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

drop function if exists public.prune_google_sheet_rows(text[],text[],text[]);
create function public.prune_google_sheet_rows(
  service_keys text[], invoice_keys text[], cash_keys text[], cash_balance_keys text[]
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
end;
$$;
revoke all on function public.prune_google_sheet_rows(text[],text[],text[],text[]) from public, anon, authenticated;

commit;
