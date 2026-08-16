-- DCS: base de seguridad y Row Level Security
-- Ejecutar desde Supabase SQL Editor con una cuenta propietaria del proyecto.

begin;

-- El rol de acceso vive en app_metadata para que el usuario no pueda
-- autoconcederse privilegios desde el cliente.
create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() = any(allowed_roles);
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.has_app_role(text[]) from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(text[]) to authenticated;

-- Datos no sensibles del perfil. El cargo NO se duplica aquí: se obtiene
-- siempre desde auth.users.raw_app_meta_data / JWT app_metadata.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

drop policy if exists "profiles_select_authorized" on public.profiles;
create policy "profiles_select_authorized"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.has_app_role(array['Propietario', 'Administrador', 'Coordinador'])
);

drop policy if exists "profiles_insert_management" on public.profiles;
create policy "profiles_insert_management"
on public.profiles
for insert
to authenticated
with check (
  public.has_app_role(array['Propietario', 'Administrador'])
);

drop policy if exists "profiles_update_management" on public.profiles;
create policy "profiles_update_management"
on public.profiles
for update
to authenticated
using (
  public.has_app_role(array['Propietario', 'Administrador'])
)
with check (
  public.has_app_role(array['Propietario', 'Administrador'])
);

drop policy if exists "profiles_delete_management" on public.profiles;
create policy "profiles_delete_management"
on public.profiles
for delete
to authenticated
using (
  public.has_app_role(array['Propietario', 'Administrador'])
);

-- Crea automáticamente el perfil al registrar usuarios nuevos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Incorpora de forma segura los usuarios que ya existían.
insert into public.profiles (id, full_name, phone)
select
  id,
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'phone'
from auth.users
on conflict (id) do nothing;

commit;

-- Verificación esperada: todas las tablas públicas deben tener RLS activo.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
