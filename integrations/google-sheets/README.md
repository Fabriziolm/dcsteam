# Sincronización DCS: Google Sheets → Supabase

Usa las tres copias nativas creadas en Drive. Los Excel originales permanecen intactos.

1. Aplica `supabase/migrations/20260816130000_sheet_sync.sql`.
2. Despliega `supabase/functions/sheets-sync` desde Supabase Edge Functions. En el proyecto actual se publicó con el nombre `bright-endpoint`.
3. Crea el secreto `SHEETS_SYNC_SECRET` en Supabase.
4. Crea un proyecto de Apps Script y pega `DCS_Sync.gs`.
5. En Propiedades del script configura `SYNC_URL` como `https://mfwefoxzadlcjvfutzyk.supabase.co/functions/v1/bright-endpoint` y `SYNC_SECRET` con el mismo secreto.
6. Ejecuta `syncDcs` para la carga inicial y `installHourlyTrigger` para sincronizar cada hora.

Las claves `source_system + source_key` evitan duplicados al repetir la sincronización.
