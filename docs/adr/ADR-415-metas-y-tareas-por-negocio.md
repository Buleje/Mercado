# ADR-415 — Metas y tareas del panel: una lista por negocio, en la base

- **Fecha:** 2026-09-14
- **Estado:** aceptado — SQL aplicado el 2026-09-14 (8/8 sentencias)
- **Pedido por:** Brandon — «Metas y tareas por negocio» (ronda de mejoras tras el barrido de errores del servidor)
- **Reemplaza:** el uso de `lib/file-store.ts` para `goals` y `tasks` (el archivo sigue para `beta-feedback`)
- **No toca:** `lib/auth/role-permissions.ts` ni los roles de las rutas

## Contexto (medido, 2026-09-14)

| Qué | Cifra | Fuente |
|---|---|---|
| Aislamiento | **ninguno**: `local-data/goals.json` y `local-data/tasks.json` sin `tenantId`, los mismos para todos los negocios | `lib/file-store.ts`, 4 rutas en `app/api/{goals,tasks}` |
| Datos a copiar | **0**: no hay `local-data/` en el checkout ni en las carpetas típicas | `ls`, búsqueda de `migration-planner` |
| Producción | el disco del proyecto en Vercel es de sólo lectura: `writeData` falla, así que nunca se guardó una meta ni una tarea (deducido del mecanismo, sin logs) | rama `prod` (`7774f5ca`) tiene las 4 rutas |
| Quién las usa | `GoalsTab`, `TasksTab`, `MetasLogrosModule` (KPIs) y el prefetch del panel | `grep "/api/goals\|/api/tasks"` |
| Validación | ninguna: los PATCH hacían `{ ...registro, ...body }` y cualquier campo entraba, incluido `createdAt` | rutas `[id]` |
| Negocios en la base | 14 | `select count(*) from "Tenant"` |

## Decisión

1. **Dos tablas por tenant**, `AdminGoal` y `AdminTask`, con `@@unique([tenantId, id])` y `@@index([tenantId, createdAt])`
   como `Puesto` (ADR-414). Editar usa `where: { tenantId_id }` y borrar `deleteMany({ tenantId, id })`: el id de otro
   negocio da 404 sin leer primero. Las dos entran a `TENANT_MODELS` (`lib/tenant.ts`).
2. **Listas cerradas como `TEXT` + `CHECK`, no enums.** Las categorías ya crecieron una vez (`ticket_promedio`,
   `retencion`) y hay otra pendiente (`producto_top`); un valor de enum no se puede quitar. La misma lista vive en
   `z.enum` dentro de `lib/admin/metas-tareas.ts`.
3. **Zod `safeParse` con esquemas de edición separados y sin `.default()`.** En Zod 4, `.partial()` aplica los
   defaults: un PATCH `{ current: 5 }` también mandaba `category: "ventas"`. Las claves desconocidas se descartan.
4. **`completedAt` lo decide el servidor** al pasar a `completada` (y lo borra al reabrir); el CHECK
   `(status = 'completada') = (completedAt IS NOT NULL)` lo sostiene aunque el código falle.
5. **La respuesta conserva la forma de antes**: array en el GET, `target`/`current` como number (un Decimal
   serializado es string y rompe `current >= target`), `dueDate` como `YYYY-MM-DD` (un ISO completo deja en blanco el
   `<input type="date">`), campos vacíos omitidos.
6. **Roles sin cambio**: `requireAdmin(req)` sin lista, como hoy. `createdBy` = usuario de la sesión.
7. **Escrituras con CSRF** (`assertCsrf`), como las rutas de RRHH: el panel ya manda el token con `csrfHeaders`.

## Migración

`prisma/migrations/adr-415-metas-y-tareas.sql` — EXPAND puro (2 tablas, 4 índices, `REVOKE` a `anon`/`authenticated`
como las tablas hermanas). Sin backfill ni escritura doble: no hay datos. Se aplica ANTES de subir el código que lee
las tablas; en producción, confirmar que `DATABASE_URL` de Vercel apunta a la misma base.

**Revertir:** contar filas; sólo con las dos en 0, `DROP TABLE "AdminTask"`, `DROP TABLE "AdminGoal"`, quitar los
modelos y `prisma generate`. El código se revierte con `git revert` sin tocar la base.

## Consecuencias

- Cada negocio ve y edita sólo sus metas y tareas; en producción empiezan a guardarse.
- `lib/file-store.ts` queda sólo para `beta-feedback`, que tiene el mismo problema (público, sin tenant, disco de
  sólo lectura en Vercel) — pendiente aparte.
- Pendientes medidos por `migration-planner`, fuera de este ADR: la plantilla «Meta diaria» creada el 14/9 queda con
  `dueDate` 15/9 y una tarea que vence el 14/9 aparece vencida a las 09:00 de ese día (zona horaria de Lima);
  `assignedTo` sigue siendo texto libre (vincularlo a `Colaborador` de ADR-414 sería otra decisión).
