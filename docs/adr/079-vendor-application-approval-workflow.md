# ADR-079 — Vendor Application approval workflow + state machine

- **Status:** Accepted
- **Fecha:** 2026-04-18
- **Autores:** Brandon Buleje (MIG-4 agent)
- **Relacionado:** ADR-019 (Next 16 cache), ADR-024 (audit log), ADR-017 (indices
  DB), ADR-014 (middleware), `lib/db/supplier-signup.db.ts` (patrón
  platform-level sin tenant).
- **Supersede a:** el stub in-memory `lib/db/vendor-registrations.db.ts`
  (mantenido como shim compatible, delega al nuevo `VendorApplicationsDB`
  por una release).

---

## 1. Contexto (Feynman)

Hoy, cuando una bodega quiere **vender en Buleje**, hace esto:

| Paso | Qué pasa | Dónde vive |
|---|---|---|
| 1. Visita `/vender` | Lee la landing, usa la calculadora | `app/vender/page.tsx` |
| 2. Clickea "Empezar" | Arranca el wizard 5-pasos | `app/vender/registro/RegistroClient.tsx` |
| 3. Completa wizard | Datos negocio, contacto, verificación, horarios, plan | 5 steps |
| 4. Submit | POST a `/api/vendor/registration` | route.ts |
| 5. Router guarda solicitud | En un `Map<id,record>` en memoria | `lib/db/vendor-registrations.db.ts` |
| 6. Superadmin revisa | UI con mocks hardcodeados | `components/superadmin/VendorApplicationsModule.tsx` |

**Problema**: todo se pierde cuando el servidor cold-starta. No hay
trazabilidad, no hay histórico de revisiones, no hay manera de saber *quién*
aprobó/rechazó ni *cuándo*. El módulo del superadmin enseña 5 aplicaciones
falsas que no tienen conexión con el backend.

Además, cuando el superadmin aprueba una solicitud, debería **crear un
`Tenant` real** para que la bodega entre al marketplace. Hoy eso tampoco
pasa — aprobar solamente cambia el status en memoria.

## 2. Decisión

Materializar el modelo `VendorApplication` en Prisma + agregar una tabla
auxiliar `VendorApplicationReview` (un log append-only por cada acción
de revisión), con una **state machine explícita** de 6 estados.

### 2.1 Modelos

```
VendorApplication
  id, businessName, ruc (unique), contactEmail, …
  status ∈ {pending, under_review, info_requested, approved, tenant_provisioned, rejected}
  reviewerUserId?, decidedAt?, decisionReason?, infoRequestNote?
  tenantId? (unique) — null hasta provisión
  reviews[] (FK)

VendorApplicationReview
  applicationId, reviewerUserId, action, note,
  previousStatus, newStatus, createdAt
```

### 2.2 State machine

Transiciones **permitidas** únicamente:

| De → A | Acción | Quién |
|---|---|---|
| `pending` → `under_review` | `start_review` | superadmin abre detalle |
| `under_review` → `info_requested` | `request_info` | superadmin pide más docs |
| `info_requested` → `under_review` | (edit via soporte — fuera de scope MVP) | soporte manual |
| `pending` / `under_review` / `info_requested` → `approved` | `approve` | superadmin |
| `approved` → `tenant_provisioned` | (automático) | hook `provisionTenant()` |
| cualquiera menos `tenant_provisioned` → `rejected` | `reject` | superadmin |
| `rejected` → `pending` | `reopen` | superadmin (docs llegaron por otro canal) |

**Prohibido:**
- `tenant_provisioned` → cualquier cosa (final state)
- `approved` → `rejected` (hay que reabrir primero si hay error)
- Cualquier transición sin reviewer registrado (garantiza audit trail)

Si alguien intenta una transición ilegal, el DB class lanza
`INVALID_STATE_TRANSITION`.

### 2.3 Pre-tenant data

`VendorApplication` **NO** lleva `tenantId` como primer argumento en su DB
class (regla CLAUDE.md #3 explícita). La razón es que la solicitud **se crea
antes de que exista el tenant** — es platform-level, igual que
`SupplierSignupDB` (ver `PLATFORM_TENANT_ID = "__platform__"`). Esto se
documenta en el header de `vendor-applications.db.ts` y queda como
**excepción justificada** a la regla general.

Cuando el superadmin procesa la aplicación, el `tenantId` se rellena
*después* de la aprobación — cuando `provisionTenant()` crea el tenant
real. Ese es el único momento en el que la columna `tenantId` se hidrata
(y dispara la transición `approved → tenant_provisioned`).

### 2.4 Tenant provisioning — stub y diferido

Crear un `Tenant` real en producción toca **zona peligrosa** (prisma/schema,
131 modelos, seed de AdminUser, setup de StoreTheme, asignación de
StoreProduct, etc.). Ese trabajo **no es scope de MIG-4** porque cada uno
requiere su propio ADR y revisión de seguridad.

Solución: `lib/vendor/tenant-provisioning.ts` exporta
`provisionTenantStub(application)` que:

- Loggea `logger.warn("[vendor-provisioning] TODO: create tenant for {ruc}")`
- Retorna un `{ tenantId, tenantSlug }` ficticio con prefijo `stub-`
- No toca la DB más que para escribir esos valores de regreso en
  `VendorApplication.tenantId` / `tenantSlug`

La implementación **real** vendrá con **ADR-080 (Tenant provisioning from
vendor approval)** — separada por riesgo.

### 2.5 API surface

**Público (sin auth, pero rate-limited estricto)**:

| Método | Path | Propósito |
|---|---|---|
| `POST` | `/api/vendor/registration` | Submit inicial — crea `VendorApplication` con `status=pending` |

**Superadmin (requiere `buleje-platform-sess`)**:

| Método | Path | Propósito |
|---|---|---|
| `GET` | `/api/admin/vendor-applications` | Lista con filtro `?status=…` |
| `GET` | `/api/admin/vendor-applications/[id]` | Detalle + reviews[] |
| `POST` | `/api/admin/vendor-applications/[id]/review` | action=start\|request_info\|approve\|reject\|reopen |
| `GET` | `/api/admin/vendor-applications/stats` | KPIs pendientes/aprobadas/tiempo-promedio |

### 2.6 Duplicate RUC

`@@unique(ruc)` a nivel schema. Si ya hay una aplicación con ese RUC
(sin importar status), el submit público responde **409 Conflict** con
mensaje `"Ya tenés una aplicación con ese RUC. Contactá a soporte para
consultar tu estado."` — y no crea fila nueva.

### 2.7 Cache strategy (ADR-019)

- `getStats()`, `listByStatus(status)`, `listPending()` → `"use cache"` +
  `cacheLife({ revalidate: 30, stale: 15, expire: 120 })`.
- Tags: `cacheTag("vendor-applications:list")`,
  `cacheTag("vendor-applications:stats")`,
  `cacheTag("vendor-applications:${id}")` para el detalle.
- Invalidación en writes: `revalidateTag("vendor-applications:list")`
  + `revalidateTag("vendor-applications:${id}")`.

## 3. Alternativas consideradas

### 3.1 Aprobación síncrona (rechazado)

Proveer `/api/vendor/registration?autoApprove=1` en dev, y sincronizar la
creación del tenant con el propio submit. **Descartado** porque:

- La revisión humana es condición comercial (Ley 29733 + fraude SUNAT)
- El cold-path del creation de tenant tarda >3 s; malo para UX del vendor
- Necesitamos audit trail con `reviewerUserId`

### 3.2 Queue asíncrono con worker (over-engineered)

Usar BullMQ + worker dedicado que procese las aprobaciones en background.
**Descartado para MVP** porque:

- El volumen es 1-5 aplicaciones/semana — no necesita queue
- Agregaría dependencia (Redis worker) sin upside
- Cuando escalemos: fácil migrar (el state machine ya existe, solo se
  mueve el `provisionTenant` a job)

### 3.3 Acoplar `VendorApplication` a `Supplier` (rechazado)

`Supplier` existe ya con un flujo similar. **Descartado**:

- `Supplier` = proveedor que VENDE a la bodega (B2B)
- `VendorApplication` = bodega que se suma al marketplace (B2C onboarding)
- Son dos dominios con requisitos legales distintos (Supplier no crea
  Tenant; VendorApplication sí)

## 4. Consecuencias

### 4.1 Positivas

- Auditabilidad total: cada cambio de status queda en `VendorApplicationReview`
- Las 5 aplicaciones hardcodeadas se reemplazan con queries reales
- La regla "RUC único" se enforza en DB, no en app
- Abre la puerta a un ADR-080 de provisioning real

### 4.2 Negativas

- La vida del `lib/db/vendor-registrations.db.ts` queda deprecada — hay un
  shim que delega al nuevo DB class para no romper call-sites existentes,
  pero en la próxima release se puede borrar.
- `tsc --noEmit` sube en 40+ líneas de types generados por Prisma (sin
  impacto en build time).
- El superadmin puede aprobar solicitudes pero el tenant queda con
  `stub-*` hasta que ADR-080 aterrice. Hay un banner explicando esto.

### 4.3 Rollback

- Revertir commits en orden inverso (`feat(db)` → `feat(prisma)` → ADR).
- La migration SQL es **expand only** (solo crea tablas, no borra ni
  altera existentes), así que `DROP TABLE vendor_applications CASCADE;
  DROP TABLE vendor_application_reviews CASCADE;
  DROP TYPE "ApplicationStatus" CASCADE;` basta para undo.
- Los call-sites viejos (`VendorRegistrationsDB.create`) siguen andando
  contra el shim — no hay breaking changes públicos.

## 5. Métricas y observabilidad

| Métrica | Fuente | SLO |
|---|---|---|
| **Avg review time** | `getStats()` — diff `decidedAt - submittedAt` | <48h |
| **Approval rate** | `approved / (approved + rejected)` | >60% |
| **Rejection reasons top-5** | `groupBy(decisionReason)` en `rejected` | — |
| **Pending backlog** | `count(status=pending)` > 14 días | <3 simultáneas |
| **Stub tenants sin upgrade** | `count(tenantId LIKE 'stub-%')` | =0 post-ADR-080 |

Dashboard en `/superadmin/vendor-applications` enseña las 4 primeras.

## 6. Testing

- State machine: test unitario por cada transición (permitida + prohibida).
  Archivo: `__tests__/vendor-applications-state-machine.test.ts`
- Rate limit: `STRICT` preset (10/15min) en `/api/vendor/registration` —
  preserva el comportamiento del stub actual.
- Zod `safeParse` en submit público, 400 con field name en error.

## 7. Rollout

1. Mergear migration SQL (expand only — no rompe nada).
2. Correr `prisma migrate deploy` con DIRECT_URL.
3. Opcional: `scripts/backfill-vendor-applications.ts` para insertar los
   5 mocks del UI como aplicaciones `pending` y `approved`.
4. Superadmin puede empezar a revisar solicitudes reales de inmediato.

---

**Próximos pasos**: ADR-080 — Tenant provisioning pipeline (crea tenant
real, siembra default StorePage, genera AdminUser, envía email con
credenciales, webhook Stripe setup).
