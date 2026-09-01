-- Adjuntos privados para comprobantes de facturación.
alter table public.invoices
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-files',
  'invoice-files',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists invoice_files_insert_management on storage.objects;
create policy invoice_files_insert_management
on storage.objects for insert to authenticated
with check (
  bucket_id = 'invoice-files'
  and public.is_active_user()
  and public.has_app_role(array['Propietario','Administrador'])
);

drop policy if exists invoice_files_read_management on storage.objects;
create policy invoice_files_read_management
on storage.objects for select to authenticated
using (
  bucket_id = 'invoice-files'
  and public.is_active_user()
  and public.has_app_role(array['Propietario','Administrador','Coordinador'])
);
