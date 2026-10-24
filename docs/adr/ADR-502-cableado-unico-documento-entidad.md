# ADR-502 — Cableado único documento↔entidad por tag + carpeta

- **Estado:** aceptado (2026-10-18). Sin cambio de schema.
- **Pedido por:** Brandon (18-10), «Archivo como hub» (Fase 0, molde Terceros/Adelantos).

## Contexto

Había tres patrones de tag dispersos: asistencia (`lib/rrhh/asistencia-fotos.ts`, `colaborador:<id>`), plan forestal y guías (`lib/forestal/documentos-guia.ts`). Además, sólo cliente, proveedor y orden tienen FK en `Document`. Terceros, permisos, colaboradores (pagos) y trámites no tenían forma de colgar sus papeles del Archivo.

## Decisión

1. `lib/documentos/enlaces-entidad.ts` (puro, cliente y servidor): `tagEntidad(tipo,id)` = `<tipo>:<id>`, `rutaCarpetaEntidad`, `etiquetasDeEntidad`, `ROLES_ENTIDAD_SENSIBLE`. `colaborador` reusa `tagColaborador` de asistencia.
2. `lib/db/enlaces-entidad.db.ts`: clase fina que orquesta `DocumentsDB` (carpeta idempotente con `createFolderTree`, documento con `create` → subir → `setStoragePath`, listado por tag). Sin `prisma.*`; `tenantId` 1er parámetro.
3. Los papeles sensibles se archivan con `allowedRoles` en el documento (no sólo en la ruta).
4. Primer consumidor: `POST /api/admin/documents/estado-cuenta` (PDF del estado de cuenta de un tercero, calculado con `movimientosDePersona`).

## Alternativa descartada

Cuatro FK nuevas (`terceroId`, `permisoId`, `colaboradorId`, `tramiteId`) con índices sobre `Document`: tabla compartida con producción, migración con bloqueo, y `tags` + `folderId` ya existen e indexados (`tags` con `hasSome`).

## Consecuencias

Un documento de entidad se encuentra por tag aunque lo muevan de carpeta. Contra: el tag no tiene integridad referencial; si se borra la entidad, el documento queda huérfano (visible en su carpeta).

## Nota 24-10 — nombre propio del vínculo y quién lo ligó

- **Nombre propio (alias)**: `admin_prefs["vinculoAlias:<clave del tag>"] = alias` (una clave por tercero; `null` = quitado; el mapa `vinculosAlias` del primer día se sigue leyendo) en `Settings.featureFlagsJson`, vía `VinculosCarpetaDB` (`lib/db/vinculos-carpeta.db.ts`) → `AdminPreferencesDB`. Es por negocio y por tercero (todas sus carpetas lo muestran igual), sin schema. No va en el tag: el tope de 40 caracteres ya lo usa la clave, y renombrar no debe romper la búsqueda por `hasSome`. Tope 60. Una clave por tercero porque la escritura atómica de `admin_prefs` mezcla un solo nivel: con un mapa, dos renombres simultáneos se pisaban (seguridad 24-10).
- **Registro**: ligar y quitar por `folders/bulk` (addTags/removeTags) dejan `ActivityLog` con `entity="DocumentFolder"`, `action=VINCULO_LIGAR|VINCULO_QUITAR`, `detail={clave}`; se espera antes de responder. Lo ligado antes del 24-10 no tiene registro.
- **Permisos**: ver = quien ve la carpeta; cambiar = admin/owner/manager y sólo en carpetas que su rol ve por toda la cadena (`DocumentsDB.carpetasQuePuedeTocar`), también en `bulk addTags/removeTags`.
