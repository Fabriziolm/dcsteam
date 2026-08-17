# Sincronización DCS: Google Sheets → Supabase

Las tres copias nativas son la fuente oficial del proyecto. Los Excel originales
se conservan como respaldo y la app nunca escribe en Google Sheets.

Fuentes canónicas:

- Control de Transporte: `1D70tEINHJqtVKTfTtYZ1cF6YVfDvC8WuVSfKP2I7X88`
- Facturas: `1fh1b7QU8RHAYf7Y1Wf0Q5_wHk-hKMI5y-I_mtqrpxj8`
- Entradas y Salidas: `1OjUHwECw7PqN6MOv8LKlsDuFrJZF5fhx_MQFNIoGyTQ`

## Activación

1. Aplicar `supabase/migrations/20260817040000_cash_movements_sync.sql`.
2. Desplegar `supabase/functions/sheets-sync` con el nombre `bright-endpoint`.
3. Verificar el secreto `SHEETS_SYNC_SECRET` en Supabase.
4. Crear un proyecto independiente de Apps Script y pegar `DCS_Sync.gs`.
5. Configurar las propiedades del script:
   - `SYNC_URL`: `https://mfwefoxzadlcjvfutzyk.supabase.co/functions/v1/bright-endpoint`
   - `SYNC_SECRET`: el mismo secreto configurado en Supabase.
6. Ejecutar una vez `syncDcs` para la carga histórica.
7. Ejecutar una vez `installFiveMinuteTrigger` para actualizar cada cinco minutos.

Las claves `source_system + source_key` permiten repetir cargas sin duplicar.
Una fila modificada se actualiza y una fila eliminada desaparece de la app en la
siguiente sincronización correcta.
