-- Administración segura de usuarios activos y cargos.
begin;

create or replace function public.admin_list_users()
returns table(id uuid, email text, full_name text, active boolean, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() or not public.has_app_role(array['Propietario','Administrador']) then
    raise exception 'Acceso denegado';
  end if;
  return query
  select u.id, u.email::text, p.full_name, coalesce(p.active,false), coalesce(u.raw_app_meta_data->>'role','Sin cargo'), u.created_at
  from auth.users u left join public.profiles p on p.id=u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.manage_user_access(target_user_id uuid, new_role text, new_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() or not public.has_app_role(array['Propietario','Administrador']) then raise exception 'Acceso denegado'; end if;
  if new_role not in ('Administrador','Coordinador','Chofer','Auxiliar') then raise exception 'Cargo no válido'; end if;
  if target_user_id = auth.uid() and not new_active then raise exception 'No puedes desactivar tu propia cuenta'; end if;
  update auth.users set raw_app_meta_data=jsonb_set(coalesce(raw_app_meta_data,'{}'::jsonb),'{role}',to_jsonb(new_role),true) where id=target_user_id;
  update public.profiles set active=new_active,updated_at=now() where id=target_user_id;
end;
$$;

revoke all on function public.admin_list_users() from public,anon;
revoke all on function public.manage_user_access(uuid,text,boolean) from public,anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.manage_user_access(uuid,text,boolean) to authenticated;
commit;
