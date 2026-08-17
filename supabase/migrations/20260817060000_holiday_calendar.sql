-- Calendario configurable para estimaciones semanales de jornada.
begin;
create table if not exists public.holidays (
  holiday_date date primary key,
  name text not null,
  credited_hours numeric(4,2) not null default 8 check (credited_hours >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.holidays enable row level security;
alter table public.holidays force row level security;
revoke all on public.holidays from anon;
grant select, insert, update, delete on public.holidays to authenticated;
drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using (public.is_active_user());
drop policy if exists holidays_manage on public.holidays;
create policy holidays_manage on public.holidays for all to authenticated
using (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']))
with check (public.is_active_user() and public.has_app_role(array['Propietario','Administrador']));
insert into public.holidays(holiday_date,name) values
('2026-01-01','Año Nuevo'),('2026-04-02','Jueves Santo'),('2026-04-03','Viernes Santo'),
('2026-05-01','Día del Trabajo'),('2026-06-07','Batalla de Arica y Día de la Bandera'),
('2026-06-29','San Pedro y San Pablo'),('2026-07-23','Día de la Fuerza Aérea del Perú'),
('2026-07-28','Fiestas Patrias'),('2026-07-29','Fiestas Patrias'),('2026-08-06','Batalla de Junín'),
('2026-08-30','Santa Rosa de Lima'),('2026-10-08','Combate de Angamos'),
('2026-11-01','Día de Todos los Santos'),('2026-12-08','Inmaculada Concepción'),
('2026-12-09','Batalla de Ayacucho'),('2026-12-25','Navidad')
on conflict (holiday_date) do update set name=excluded.name,active=true;
commit;
