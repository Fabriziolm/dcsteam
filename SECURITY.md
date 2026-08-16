# Seguridad de datos

La autorización se basa en `auth.users.raw_app_meta_data.role`, expuesta en el JWT como `app_metadata.role`. Nunca se debe usar `user_metadata.role` para conceder acceso.

## Matriz inicial

| Acción sobre perfiles | Propietario | Administrador | Coordinador | Chofer/Auxiliar |
|---|---:|---:|---:|---:|
| Ver su perfil | Sí | Sí | Sí | Sí |
| Ver el equipo | Sí | Sí | Sí | No |
| Crear, editar o eliminar | Sí | Sí | No | No |

Los usuarios anónimos no tienen permisos sobre `public.profiles`. La migración activa y fuerza RLS, crea las políticas y genera perfiles automáticamente para nuevos usuarios.

Para aplicar la migración, copiar el contenido de `supabase/migrations/20260816032000_security_rls.sql` en Supabase SQL Editor y ejecutarlo como propietario del proyecto.
