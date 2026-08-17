-- DCS: simplifica el acceso a tres cargos y protege comprobantes de gastos de la app.
begin;

-- Los propietarios conservan control total. Los coordinadores pasan al nivel operativo
-- para no recibir acceso financiero por una conversión automática.
update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  to_jsonb(case raw_app_meta_data ->> 'role'
    when 'Propietario' then 'Administrador'
    when 'Coordinador' then 'Chofer'
    else raw_app_meta_data ->> 'role'
  end),
  true
)
where raw_app_meta_data ->> 'role' in ('Propietario', 'Coordinador');

update public.expenses
set source_system = 'dcs_app'
where source_system is null;

create index if not exists expenses_app_week_idx
on public.expenses (expense_date desc, vehicle_id)
where source_system = 'dcs_app';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_insert_own on storage.objects;
create policy expense_receipts_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'expense-receipts'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read
on storage.objects for select to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_active_user()
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_app_role(array['Administrador'])
  )
);

create or replace function public.approve_user(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() or not public.has_app_role(array['Administrador']) then
    raise exception 'Acceso denegado';
  end if;
  if new_role not in ('Administrador','Chofer','Auxiliar') then
    raise exception 'Cargo no válido';
  end if;
  update auth.users
  set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', to_jsonb(new_role), true)
  where id = target_user_id;
  update public.profiles set active = true, updated_at = now() where id = target_user_id;
end;
$$;

create or replace function public.manage_user_access(target_user_id uuid, new_role text, new_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() or not public.has_app_role(array['Administrador']) then
    raise exception 'Acceso denegado';
  end if;
  if new_role not in ('Administrador','Chofer','Auxiliar') then
    raise exception 'Cargo no válido';
  end if;
  if target_user_id = auth.uid() and new_active = false then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;
  update auth.users
  set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', to_jsonb(new_role), true)
  where id = target_user_id;
  update public.profiles set active = new_active, updated_at = now() where id = target_user_id;
end;
$$;

revoke all on function public.approve_user(uuid,text) from public, anon;
grant execute on function public.approve_user(uuid,text) to authenticated;
revoke all on function public.manage_user_access(uuid,text,boolean) from public, anon;
grant execute on function public.manage_user_access(uuid,text,boolean) to authenticated;

commit;
