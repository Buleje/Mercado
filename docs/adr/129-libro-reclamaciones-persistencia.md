# ADR-129 — Persistencia del Libro de Reclamaciones (modelo `Reclamo`)

**Fecha:** 2026-06-02
**Estado:** Implementado
**Decisión:** Brandon
**Relacionado:** Ley N° 29571 (Código de Protección y Defensa del Consumidor), D.S. 011-2011-PCM (Reglamento del Libro de Reclamaciones), Ley N° 29733 (Protección de Datos Personales), commit `5284d214` (Libro de Reclamaciones v1)

---

## Contexto

El Libro de Reclamaciones Virtual (`/libro-de-reclamaciones`) v1 **solo enviaba la
hoja por email** (`/api/libro-reclamaciones`, fire-and-forget) y devolvía `ok:true`
con un código aleatorio. Problemas legales detectados en la auditoría 2026-06-02:

1. **Sin registro conservable.** El D.S. 011-2011-PCM exige conservar las hojas del
   libro por **mínimo 2 años** y que INDECOPI pueda auditarlas. Un email no es un
   libro: si Resend falla o no está configurado, el reclamo **se pierde** y aun así
   se le dice al consumidor "registrado".
2. **Código no correlativo.** El DS exige **número correlativo**; v1 usaba un sufijo
   aleatorio.
3. **Sin trazabilidad de respuesta** (estado, fecha de respuesta del proveedor).

## Decisión

Persistir cada hoja en DB **antes** de responder al consumidor. El email pasa a ser
acuse secundario (fire-and-forget); la fuente de verdad legal es la fila en DB.

**Modelo** (`prisma/schema.prisma`): `Reclamo` — **platform-level** (el Libro es de
la plataforma, no de un tenant; endpoint público sin `tenantId`). Campos:
identificación del consumidor (DS art. anexo), del bien, de la reclamación, gestión
de respuesta del proveedor (`estado`/`respuesta`/`respondidoEn`), auditoría
(`ip`/`userAgent`/`createdAt`) y `tenantId`/`tienda` opcionales para futura
derivación al vendor del marketplace.

**Correlativo:** `numero Int @default(autoincrement())` → código humano
`LR-AAAA-NNNNNN` derivado del número (correlativo real, secuencial).

**DB class** (`lib/db/reclamos.db.ts`): `ReclamosDB` con `create` (inserta + setea
código) y helpers de lectura para un futuro panel superadmin. Sin `tenantId` 1er
param **por diseño** (recurso de plataforma) — excepción documentada al rubric
`db-class.json`.

**API** (`app/api/libro-reclamaciones/route.ts`): `safeParse` → `ReclamosDB.create`
(DB-first) → si falla devuelve 500 (no miente "registrado") → emails (acuse +
registro) fire-and-forget → responde el código real.

## Consecuencias

- ✅ Registro conservable y auditable por INDECOPI; cumple retención ≥ 2 años.
- ✅ Código correlativo real.
- ✅ No se pierde ningún reclamo aunque el email falle.
- ✅ Base para panel de respuesta/seguimiento (siguiente iteración, no bloqueante).
- ⚠️ Migración aditiva (`CREATE TABLE` idempotente, sin DROP, sin NOT NULL sin
  default sobre datos existentes — tabla nueva vacía). Aplicada al Supabase
  compartido vía MCP; archivo en `prisma/migrations/` para CI/`migrate deploy`.
- ⚠️ Requiere reiniciar el dev server tras `prisma generate` (cliente Prisma viejo
  en memoria — gotcha conocido).

## Alternativas consideradas

- **Seguir solo con email** — descartado: no es un libro conservable (incumple DS).
- **Loguear en `SupportTicket`/`NotificationLog`** — descartado: semántica distinta,
  sin los campos legales obligatorios de la hoja.
- **Modelo tenant-scoped** — descartado v1: el Libro es de la plataforma. La
  derivación por vendor se hará con `tenantId`/`tienda` opcionales ya previstos.

## Pendiente (no bloqueante de este ADR)

- Datos del titular en `lib/legal.ts` (RUC, razón social, domicilio) — acción de
  Brandon, dato legal real.
- Panel superadmin para responder/cerrar reclamos y export INDECOPI.
- Derivación automática del reclamo al vendor del marketplace.

## Referencias

- `app/(store)/libro-de-reclamaciones/page.tsx`, `components/legal/LibroReclamacionesForm.tsx`
- `lib/legal.ts`, `lib/db/reclamos.db.ts`, `app/api/libro-reclamaciones/route.ts`
- `prisma/migrations/20260602120000_add_reclamo/migration.sql`
