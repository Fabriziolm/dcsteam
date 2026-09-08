-- Permite que un auxiliar registre gastos para la unidad del servicio que tiene asignado.
begin;

drop policy if exists expenses_insert_own on public.expenses;
create policy expenses_insert_own on public.expenses for insert to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and status = 'Pendiente'
  and (
    exists (
      select 1
      from public.user_vehicle_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.vehicle_id = expenses.vehicle_id
        and assignment.active = true
    )
    or exists (
      select 1
      from public.service_assignments assignment
      join public.services service on service.id = assignment.service_id
      where assignment.user_id = auth.uid()
        and service.vehicle_id = expenses.vehicle_id
    )
  )
);

-- Habilita la limpieza si la foto sube, pero el registro del gasto falla.
drop policy if exists expense_receipts_delete_own on storage.objects;
create policy expense_receipts_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
