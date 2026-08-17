-- Enlaces privados de seguimiento GPS, visibles solo para gestión y coordinación.
begin;
create table if not exists public.gps_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null default 'Inkacel GPS',
  sharing_url text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gps_integrations enable row level security;
alter table public.gps_integrations force row level security;
revoke all on public.gps_integrations from anon;
grant select,insert,update,delete on public.gps_integrations to authenticated;
create policy gps_read_management on public.gps_integrations for select to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));
create policy gps_manage_admin on public.gps_integrations for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));
commit;
