-- Idempotencia para sincronización desde las copias nativas de Google Sheets.
begin;
alter table public.services add column if not exists source_system text;
alter table public.services add column if not exists source_key text;
alter table public.invoices add column if not exists source_system text;
alter table public.invoices add column if not exists source_key text;
alter table public.expenses add column if not exists source_system text;
alter table public.expenses add column if not exists source_key text;
create unique index if not exists services_source_key_idx on public.services(source_system,source_key);
create unique index if not exists invoices_source_key_idx on public.invoices(source_system,source_key);
create unique index if not exists expenses_source_key_idx on public.expenses(source_system,source_key);
commit;
