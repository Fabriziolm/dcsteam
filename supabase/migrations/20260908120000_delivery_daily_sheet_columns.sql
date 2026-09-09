-- Conserva los valores operativos originales de las columnas B y O de la
-- hoja "Registro Entregas" para el reporte diario.
alter table public.services
  add column if not exists source_day text,
  add column if not exists source_plate text;

