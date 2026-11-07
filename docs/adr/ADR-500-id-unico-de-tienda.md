# ADR-500 — ID único de cada tienda para soporte («ID 482-917»)

- **Estado:** aceptado (2026-10-18). Cambio de schema aditivo (fase expand), ya aplicado en la base compartida.
- **Pedido por:** Brandon (18-10): «que cada tienda creada tenga un ID único tanto en superadmin como admin del negocio, para que cuando un usuario tiene algún problema me mande su ID y lo resuelva desde superadmin».

## Decisión

1. **Columna `Tenant.codigo`** (`TEXT NOT NULL`, índice único `Tenant_codigo_key`, CHECK `Tenant_codigo_formato` = `^[1-9][0-9]{5}$`): 6 dígitos aleatorios 100000-999999. No es correlativo (no deja contar cuántas tiendas hay ni adivinar la de al lado) y se dicta por teléfono. El `id` cuid y el `slug` no cambian ni se reemplazan: el código es sólo para soporte.
2. **Lo pone la base**: `@default(dbgenerated("generar_codigo_tienda()"))`. La función plpgsql sortea y reintenta si choca (50 intentos, después `RAISE`); `SET search_path = public, pg_temp`, sin `EXECUTE` para `PUBLIC`/`anon`/`authenticated`. Ningún alta de tienda (onboarding, superadmin, scripts) tiene que acordarse de generarlo.
3. **Migración** `20261018_tenant_codigo_tienda`, en un solo `.sql` por :5432: función → columna nullable → backfill fila por fila (`DO`, por `createdAt`) → `SET DEFAULT` → `SET NOT NULL` → CHECK → índice único. Marcada con `migrate resolve --applied`.
4. **Se guarda «482917», se muestra «ID 482-917»** (`lib/codigo-tienda.ts`: `formatearCodigoTienda`), en mono con un botón que copia «482-917» (`components/superadmin/_shared/CodigoTienda.tsx`, un solo dibujo para el superadmin y el panel).
5. **Búsqueda** (`normalizarCodigoTienda` + `coincideNegocio`): acepta «482917», «482-917», «#482 917», «ID 482917», «N° 482917». Con «ID»/«#» adelante busca sólo por ID; con dígitos sueltos también por teléfono/RUC, como siempre. La usan la lista de Tiendas y el Ctrl+K, que abre la ficha rápida (`/superadmin/tenants?ficha=<slug>`).
6. **Panel del negocio**: «ID de tu negocio» en el menú de cuenta y en Ajustes › Datos del negocio. Sale de `/api/auth/me`, que lo lee con el `tenantId` de la SESIÓN (`TenantsDB.codigoDe`, caché 24 h), nunca de un parámetro del cliente.

## Consecuencias

- El ID es fijo: no hay pantalla para cambiarlo. Si algún día hiciera falta, es un UPDATE que respeta el CHECK y el único.
- Con 900.000 valores posibles el sorteo choca poco hasta decenas de miles de tiendas; si se acercara al tope, se amplía a 7 dígitos sin romper los existentes (el CHECK cambia, la columna no).
- El `contract` no aplica: no se reemplazó nada.
- El Ctrl+K del superadmin ahora abre la ficha rápida en vez de «Ficha 360» (que sigue a un clic, dentro de la ficha).
- El ID identifica la tienda, no a quien habla: lo ve cualquier rol del panel (también cajero y almacenero). Quien escribe a soporte con un ID no queda probado como dueño; antes de cambiar algo sensible, confirmar por el canal del dueño (security 18-10).
