-- DCS: evidencia privada y ubicación GPS para entrada y salida de jornada.
begin;

alter table public.time_entries add column if not exists clock_in_lat double precision;
alter table public.time_entries add column if not exists clock_in_lng double precision;
alter table public.time_entries add column if not exists clock_in_accuracy double precision;
alter table public.time_entries add column if not exists clock_in_photo text;
alter table public.time_entries add column if not exists clock_out_lat double precision;
alter table public.time_entries add column if not exists clock_out_lng double precision;
alter table public.time_entries add column if not exists clock_out_accuracy double precision;
alter table public.time_entries add column if not exists clock_out_photo text;

alter table public.time_entries drop constraint if exists time_entries_clock_in_location_check;
alter table public.time_entries add constraint time_entries_clock_in_location_check check (
  (clock_in_lat is null and clock_in_lng is null)
  or (clock_in_lat between -90 and 90 and clock_in_lng between -180 and 180)
);
alter table public.time_entries drop constraint if exists time_entries_clock_out_location_check;
alter table public.time_entries add constraint time_entries_clock_out_location_check check (
  (clock_out_lat is null and clock_out_lng is null)
  or (clock_out_lat between -90 and 90 and clock_out_lng between -180 and 180)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-evidence','attendance-evidence',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists attendance_evidence_insert_own on storage.objects;
create policy attendance_evidence_insert_own on storage.objects for insert to authenticated
with check (bucket_id='attendance-evidence' and public.is_active_user() and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists attendance_evidence_read on storage.objects;
create policy attendance_evidence_read on storage.objects for select to authenticated
using (bucket_id='attendance-evidence' and public.is_active_user() and ((storage.foldername(name))[1]=auth.uid()::text or public.has_app_role(array['Administrador'])));

commit;
