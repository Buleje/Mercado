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
