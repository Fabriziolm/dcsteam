begin;
create or replace function public.prune_google_sheet_rows(service_keys text[], invoice_keys text[], cash_keys text[], cash_balance_keys text[], work_hour_keys text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.expenses where source_system='google_sheets' and split_part(source_key,':',1)='transport' and not (split_part(source_key,':',1)||':'||split_part(source_key,':',2)=any(service_keys));
  delete from public.service_assignments where service_id in (select id from public.services where source_system='google_sheets' and not (source_key=any(service_keys)));
  delete from public.services where source_system='google_sheets' and not (source_key=any(service_keys));
  delete from public.invoices where source_system='google_sheets' and not (source_key=any(invoice_keys));
  delete from public.cash_movements where source_system='google_sheets' and not (source_key=any(cash_keys));
  delete from public.cash_balance_snapshots where source_system='google_sheets' and not (source_key=any(cash_balance_keys));
  if cardinality(work_hour_keys)>0 then delete from public.imported_work_hours where source_system='google_sheets' and not (source_key=any(work_hour_keys)); end if;
end;
$$;
commit;
