-- Solicitudes auditables para corregir marcaciones sin permitir que el trabajador
-- altere directamente la evidencia original.
create table if not exists public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  correction_type text not null check (correction_type in ('Entrada','Salida','Reabrir')),
  proposed_time timestamptz,
  reason text not null check (char_length(trim(reason)) >= 8),
  original_clock_in timestamptz,
  original_clock_out timestamptz,
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobada','Rechazada')),
  reviewed_by uuid references auth.users(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (correction_type = 'Reabrir' or proposed_time is not null)
);

create unique index if not exists attendance_correction_pending_idx
on public.attendance_correction_requests(time_entry_id)
where status = 'Pendiente';

create or replace function public.capture_attendance_correction_originals()
returns trigger language plpgsql security definer set search_path = public as $$
declare entry_row public.time_entries%rowtype;
begin
  select * into entry_row from public.time_entries where id=new.time_entry_id;
  if not found or entry_row.user_id <> auth.uid() then raise exception 'Marcación no válida'; end if;
  new.user_id := auth.uid();
  new.original_clock_in := entry_row.clock_in;
  new.original_clock_out := entry_row.clock_out;
  new.status := 'Pendiente';
  return new;
end; $$;

drop trigger if exists attendance_correction_capture_originals on public.attendance_correction_requests;
create trigger attendance_correction_capture_originals before insert on public.attendance_correction_requests
for each row execute function public.capture_attendance_correction_originals();

alter table public.attendance_correction_requests enable row level security;
alter table public.attendance_correction_requests force row level security;
revoke all on public.attendance_correction_requests from anon;
grant select,insert,update on public.attendance_correction_requests to authenticated;

create policy attendance_correction_read on public.attendance_correction_requests
for select to authenticated using (
  public.is_active_user() and (user_id = auth.uid() or public.has_app_role(array['Administrador']))
);
create policy attendance_correction_insert on public.attendance_correction_requests
for insert to authenticated with check (
  public.is_active_user() and user_id = auth.uid() and status = 'Pendiente'
  and exists (select 1 from public.time_entries e where e.id=time_entry_id and e.user_id=auth.uid())
);

create or replace function public.review_attendance_correction(request_id uuid, approve boolean, admin_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare request_row public.attendance_correction_requests%rowtype;
begin
  if not public.is_active_user() or not public.has_app_role(array['Administrador']) then raise exception 'Acceso denegado'; end if;
  select * into request_row from public.attendance_correction_requests where id=request_id for update;
  if not found or request_row.status <> 'Pendiente' then raise exception 'La solicitud ya fue procesada'; end if;

  if approve then
    if request_row.correction_type = 'Entrada' then
      update public.time_entries set clock_in=request_row.proposed_time,status=case when clock_out is null then 'Abierta' else 'Cerrada' end,updated_at=now() where id=request_row.time_entry_id;
    elsif request_row.correction_type = 'Salida' then
      update public.time_entries set clock_out=request_row.proposed_time,status='Cerrada',updated_at=now() where id=request_row.time_entry_id;
    else
      update public.time_entries set clock_out=null,clock_out_lat=null,clock_out_lng=null,clock_out_accuracy=null,clock_out_photo=null,status='Abierta',updated_at=now() where id=request_row.time_entry_id;
    end if;
  end if;

  update public.attendance_correction_requests set status=case when approve then 'Aprobada' else 'Rechazada' end,reviewed_by=auth.uid(),review_note=nullif(trim(admin_note),''),reviewed_at=now() where id=request_id;
end; $$;

revoke all on function public.review_attendance_correction(uuid,boolean,text) from public,anon;
grant execute on function public.review_attendance_correction(uuid,boolean,text) to authenticated;
