-- DCS: núcleo operativo basado en los archivos de actividades, facturación y caja.
-- Requiere ejecutar primero 20260816032000_security_rls.sql.

begin;

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists email text;
alter table public.profiles alter column active set default false;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, active)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    false
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  ruc text,
  contact_name text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clients_name_normalized_idx on public.clients (lower(trim(name)));
create unique index if not exists clients_ruc_idx on public.clients (ruc) where ruc is not null and ruc <> '';

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text not null,
  fuel_type text not null default 'Gasolina' check (fuel_type in ('Gasolina','GLP','Diésel','Eléctrico','Mixto')),
  current_km numeric(12,2) not null default 0 check (current_km >= 0),
  status text not null default 'Disponible' check (status in ('Disponible','En ruta','Mantenimiento','Inactivo')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_plate_idx on public.vehicles (upper(replace(plate,'-','')));

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  client_id uuid references public.clients(id),
  vehicle_id uuid references public.vehicles(id),
  merchandise text,
  origin text,
  destination text,
  scheduled_start time,
  scheduled_end time,
  status text not null default 'Programado' check (status in ('Programado','Confirmado','En ruta','Completado','Cancelado')),
  invoiced boolean not null default false,
  km_start numeric(12,2) check (km_start is null or km_start >= 0),
  km_end numeric(12,2) check (km_end is null or km_end >= 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (km_end is null or km_start is null or km_end >= km_start)
);

create index if not exists services_date_idx on public.services (service_date desc);
create index if not exists services_client_idx on public.services (client_id);

create table if not exists public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('Chofer','Auxiliar','Coordinador')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(service_id, user_id)
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  service_id uuid references public.services(id) on delete set null,
  work_date date not null default current_date,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  status text not null default 'Abierta' check (status in ('Abierta','Cerrada','Observada','Aprobada')),
  notes text,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out is null or clock_in is null or clock_out >= clock_in)
);

create index if not exists time_entries_user_date_idx on public.time_entries (user_id, work_date desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (category in ('Gasolina','GLP','Peaje','Estacionamiento','Mantenimiento','Pago personal','Impuesto','Otro')),
  concept text not null,
  amount numeric(12,2) not null check (amount > 0),
  vehicle_id uuid references public.vehicles(id),
  service_id uuid references public.services(id),
  user_id uuid not null references auth.users(id) default auth.uid(),
  receipt_url text,
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobado','Rechazado')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (expense_date desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text,
  issue_date date,
  due_date date,
  payment_date date,
  client_id uuid not null references public.clients(id),
  amount_without_tax numeric(12,2) not null default 0 check (amount_without_tax >= 0),
  amount_with_tax numeric(12,2) not null default 0 check (amount_with_tax >= 0),
  withholding_amount numeric(12,2) not null default 0 check (withholding_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'Pendiente' check (status in ('Pendiente','Parcial','Pagado','Anulada','Duplicado')),
  concept text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_number_idx on public.invoices (invoice_number) where invoice_number is not null and invoice_number <> '';

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  reported_by uuid not null references auth.users(id) default auth.uid(),
  category text not null default 'Operación' check (category in ('Operación','Vehículo','Seguridad','Documentación','Cliente','Otro')),
  severity text not null default 'Media' check (severity in ('Baja','Media','Alta','Crítica')),
  description text not null,
  evidence_url text,
  status text not null default 'Abierto' check (status in ('Abierto','En revisión','Resuelto','Descartado')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- RLS obligatorio en todas las tablas operativas.
alter table public.clients enable row level security; alter table public.clients force row level security;
alter table public.vehicles enable row level security; alter table public.vehicles force row level security;
alter table public.services enable row level security; alter table public.services force row level security;
alter table public.service_assignments enable row level security; alter table public.service_assignments force row level security;
alter table public.time_entries enable row level security; alter table public.time_entries force row level security;
alter table public.expenses enable row level security; alter table public.expenses force row level security;
alter table public.invoices enable row level security; alter table public.invoices force row level security;
alter table public.findings enable row level security; alter table public.findings force row level security;
alter table public.audit_log enable row level security; alter table public.audit_log force row level security;

revoke all on public.clients, public.vehicles, public.services, public.service_assignments, public.time_entries, public.expenses, public.invoices, public.findings, public.audit_log from anon;
grant select, insert, update, delete on public.clients, public.vehicles, public.services, public.service_assignments, public.time_entries, public.expenses, public.invoices, public.findings to authenticated;
grant select on public.audit_log to authenticated;

-- Catálogos.
create policy clients_read on public.clients for select to authenticated using (public.is_active_user());
create policy clients_manage on public.clients for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));
create policy vehicles_read on public.vehicles for select to authenticated using (public.is_active_user());
create policy vehicles_manage on public.vehicles for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));

-- Servicios: gestión ve todo; personal operativo solo lo asignado.
create policy services_read on public.services for select to authenticated using (
  public.is_active_user() and (
    public.has_app_role(array['Propietario','Administrador','Coordinador'])
    or exists (select 1 from public.service_assignments a where a.service_id = services.id and a.user_id = auth.uid())
  )
);
create policy services_manage on public.services for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));
create policy assignments_read on public.service_assignments for select to authenticated using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role(array['Propietario','Administrador','Coordinador'])));
create policy assignments_manage on public.service_assignments for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));

-- Jornadas y gastos: cada usuario registra y ve lo propio; gestión controla todo.
create policy time_read on public.time_entries for select to authenticated using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role(array['Propietario','Administrador','Coordinador'])));
create policy time_insert_own on public.time_entries for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());
create policy time_update_own on public.time_entries for update to authenticated using (public.is_active_user() and user_id = auth.uid() and status in ('Abierta','Cerrada')) with check (user_id = auth.uid());
create policy time_manage on public.time_entries for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));
create policy expenses_read on public.expenses for select to authenticated using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role(array['Propietario','Administrador','Coordinador'])));
create policy expenses_insert_own on public.expenses for insert to authenticated with check (public.is_active_user() and user_id = auth.uid() and status = 'Pendiente');
create policy expenses_update_own on public.expenses for update to authenticated using (public.is_active_user() and user_id = auth.uid() and status = 'Pendiente') with check (user_id = auth.uid() and status = 'Pendiente');
create policy expenses_manage on public.expenses for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

-- Facturación solo para propietarios y administración.
create policy invoices_management on public.invoices for all to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

-- Hallazgos: quien reporta ve lo suyo; coordinación y gestión ven todos.
create policy findings_read on public.findings for select to authenticated using (public.is_active_user() and (reported_by = auth.uid() or public.has_app_role(array['Propietario','Administrador','Coordinador'])));
create policy findings_insert_own on public.findings for insert to authenticated with check (public.is_active_user() and reported_by = auth.uid() and status = 'Abierto');
create policy findings_manage on public.findings for update to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador'])) with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador','Coordinador']));

create policy audit_management_read on public.audit_log for select to authenticated using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));

-- Aprobación segura de usuarios y asignación de cargo.
create or replace function public.approve_user(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() or not public.has_app_role(array['Propietario','Administrador']) then
    raise exception 'Acceso denegado';
  end if;
  if new_role not in ('Propietario','Administrador','Coordinador','Chofer','Auxiliar') then
    raise exception 'Cargo no válido';
  end if;
  update auth.users
  set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', to_jsonb(new_role), true)
  where id = target_user_id;
  update public.profiles set active = true, updated_at = now() where id = target_user_id;
end;
$$;

revoke all on function public.approve_user(uuid,text) from public, anon;
grant execute on function public.approve_user(uuid,text) to authenticated;

-- Datos base observados en los archivos.
insert into public.clients (name, ruc) values
  ('Indurama','20510579454'), ('Quiminap','20607983977'), ('DAR','20614141426'),
  ('Mondelez','20100164010'), ('Thaniyay','20555857251'), ('Inversiones M K & F SAC','20600008375')
on conflict do nothing;

insert into public.vehicles (name, plate, fuel_type) values
  ('DFSK','BYG761','Mixto'), ('Peugeot','AWX880','Gasolina')
on conflict do nothing;

commit;

select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public' order by tablename;
