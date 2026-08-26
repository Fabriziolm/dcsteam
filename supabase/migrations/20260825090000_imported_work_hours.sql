begin;

create table if not exists public.imported_work_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  worker_label text not null,
  week_start date not null,
  worked_minutes integer not null check (worked_minutes >= 0),
  source_value text,
  source_system text not null default 'google_sheets',
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_key)
);

create index if not exists imported_work_hours_user_week_idx
  on public.imported_work_hours (user_id, week_start desc);

alter table public.imported_work_hours enable row level security;
alter table public.imported_work_hours force row level security;
revoke all on public.imported_work_hours from anon;
grant select on public.imported_work_hours to authenticated;

create policy imported_work_hours_read on public.imported_work_hours
for select to authenticated
using (
  public.is_active_user()
  and (
    user_id = (select auth.uid())
    or public.has_app_role(array['Propietario','Administrador','Coordinador'])
  )
);

drop function if exists public.prune_google_sheet_rows(text[],text[],text[],text[]);
create function public.prune_google_sheet_rows(
  service_keys text[], invoice_keys text[], cash_keys text[], cash_balance_keys text[], work_hour_keys text[]
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
revoke all on function public.prune_google_sheet_rows(text[],text[],text[],text[],text[]) from public, anon, authenticated;

commit;
