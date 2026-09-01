# Auditoría de seguridad — 2026-08-31

## Alcance

Revisión del estado versionado de la aplicación DCS Control Operativo y del proyecto Supabase asociado (`mfwefoxzadlcjvfutzyk`). Se revisaron autenticación, variables de entorno, cliente web, Edge Functions, migraciones/RLS, permisos de funciones, dependencias y compilación.

## Resultado ejecutivo

- **RLS:** las tablas públicas revisadas aparecen con RLS habilitado en Supabase.
- **Secretos:** no se encontró un `.env` versionado ni una clave `service_role` en el código del cliente. El secreto de sincronización y `SUPABASE_SERVICE_ROLE_KEY` se leen únicamente desde variables de entorno de la Edge Function.
- **Código cliente:** usa una clave publicable (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), que es la configuración esperada para el frontend.
- **Hallazgos Supabase iniciales:** 12 advertencias de seguridad (funciones `SECURITY DEFINER` expuestas y protección de contraseñas).
- **Corrección aplicada el 2026-09-01:** las dos funciones de trigger dejaron de ser invocables por `anon`/`authenticated`, se fijó su `search_path` y se cambiaron los permisos por defecto de nuevas funciones.
- **Dependencias:** `npm audit --omit=dev` no pudo consultar el registro de npm por conectividad del entorno; no se debe interpretar como una auditoría limpia.
- **Build:** `next build` inició correctamente, pero no terminó dentro del tiempo disponible del entorno y fue detenido; queda pendiente validarlo en CI/GitHub Actions.

## Hallazgos prioritarios

### Alta — funciones `SECURITY DEFINER` ejecutables por `anon`

Supabase reporta que estas funciones pueden invocarse sin iniciar sesión mediante RPC:

- `public.capture_attendance_correction_originals()`
- `public.sync_service_invoiced()`

Acción recomendada: revocar `EXECUTE` para `anon` y `PUBLIC`; concederlo solamente al rol requerido. Revisar además que la función valide `auth.uid()` y el rol de aplicación.

### Media/alta — funciones privilegiadas ejecutables por `authenticated`

Supabase reporta exposición RPC de funciones `SECURITY DEFINER`, entre ellas `admin_list_users`, `approve_user`, `manage_user_access`, `review_attendance_correction`, `record_service_progress`, `record_vehicle_odometer`, `is_active_user` y `sync_service_invoiced`.

Acción recomendada: mantenerlas como `SECURITY DEFINER` solo cuando sea imprescindible, con `search_path` fijado y autorización interna; revocar `EXECUTE` general y otorgarlo solo a los roles necesarios. En particular, las funciones administrativas deben comprobar explícitamente `Propietario`/`Administrador`.

### Media — protección contra contraseñas filtradas desactivada

El asesor de Supabase indica que la protección contra contraseñas comprometidas está desactivada.

Acción recomendada: activarla desde Supabase Auth y exigir contraseñas robustas. Esto es un ajuste del proyecto, no del repositorio.

## Buenas prácticas verificadas

- `.gitignore` excluye `.env`, `.env.local` y variantes locales.
- Las migraciones revocan acceso `anon` a las tablas operativas y activan/forzan RLS en las tablas principales.
- La Edge Function de sincronización exige `x-sync-secret` antes de usar la clave de servicio.
- No se modificaron datos de negocio. Sí se aplicó en Supabase la migración de permisos `20260901090000_harden_function_privileges.sql`.

## Próximos pasos recomendados

1. Corregir y probar los `GRANT/REVOKE` de las funciones señaladas en un entorno de desarrollo.
2. Activar la protección de contraseñas filtradas.
3. Ejecutar `npm audit --omit=dev` y `npm run build` en GitHub Actions con salida guardada.
4. Añadir pruebas automatizadas de autorización por rol para RPC y RLS.

Después de la corrección, el asesor ya no reporta exposición anónima de los dos triggers. Permanecen advertencias informativas para RPC `SECURITY DEFINER` que la aplicación necesita invocar con usuarios autenticados y la protección de contraseñas filtradas, que debe activarse desde Supabase Auth.

## Evidencia y respaldo

Este informe se guarda junto al estado de código del commit que lo contiene. Se creará además la etiqueta Git `snapshot-2026-08-31` para identificar este punto de restauración.
