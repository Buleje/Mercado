# ADR-098 — Audit context propagation con AsyncLocalStorage (M004)

**Status:** Accepted
**Date:** 2026-05-09
**Sprint:** rounds 9-12 (security hardening Ley 29733)

## Contexto

`complianceAuditExtension` (Prisma extension en `lib/audit/prisma-middleware.ts`) escribe entries en `ActivityLog` cuando se hace UPDATE/CREATE/DELETE sobre tablas con PII (Customer, Order, Sale, Fiado, etc — Ley 29733 art. 23-25). Antes del round 9, las entries se escribían con `ipAddress: null` y `user: "system"` hardcoded — la extension corre fuera del contexto HTTP, sin acceso a `req`.

**Problema legal:** Ley 29733 art. 24 exige "origen de la operación". Sin IP+actor real, la cadena audit no es admisible como evidencia ante SBS. Multas potenciales S/2,150–430,000.

**Pentest M004 (round 7):** identificó el gap como "ALTO" pero acotado, ya que la cadena de hashes seguía intacta y el `complianceAuditExtension` filtra los reads.

## Decisión

Usar **`AsyncLocalStorage`** (Node.js native) para propagar `{ ipAddress, userId, requestId }` desde el handler HTTP hasta la Prisma extension a través de la cadena async sin tocar firmas intermedias.

### Componentes

```
lib/audit/audit-context.ts          ← AsyncLocalStorage<AuditCtx> + helpers
lib/audit/prisma-middleware.ts      ← lee getAuditContext() en writeAuditEntry
app/api/**/route.ts                 ← envuelve con runWithAuditContext(req, userId, ...)
app/api/cron/**/route.ts            ← envuelve con withAuditContext({userId:"cron:..."}...)
```

### API

| Helper | Cuándo usar |
|---|---|
| `runWithAuditContext(req, userId, fn)` | Handler HTTP. Extrae IP del request automáticamente. |
| `withAuditContext({ ipAddress, userId, requestId }, fn)` | Cron jobs. IP suele ser null, userId fijo `"cron:<job-name>"`. |
| `getAuditContext()` | Lee dentro de la cadena async. Retorna `null` si fuera del wrapper. |

### Patrón para handlers grandes (>200 líneas)

Cuando el body del handler tiene varias closures que dependen de `auth`/`session`, **splitting a subroutine**:

```ts
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "x"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, () => patchHandler(req, ctx, auth));
}

async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  // ... resto del handler con auth tipado
}
```

Esto evita closure issues, mantiene tsc limpio, y deja explícito que las escrituras adentro están bajo audit context.

### Patrón para handlers públicos (sin admin auth)

Cuando el actor es un cliente (no admin), usar phone o "anonymous":

```ts
return runWithAuditContext(
  req,
  body.customer.phone || "anonymous",
  () => OrdersDB.add(order, tenantId),
);
```

### Patrón cron

```ts
const result = await withAuditContext(
  { ipAddress: null, userId: "cron:fiados-mark-vencido", requestId: null },
  () => prisma.fiado.updateMany({ ... }),
);
```

## Consecuencias

### Positivas

- **Trazabilidad legal completa** sin tocar firmas de DB classes. Migración incremental por endpoint.
- **Fallback transparente**: handlers no migrados siguen funcionando (writeAuditEntry usa null).
- **Aislamiento async garantizado**: contextos paralelos no se mezclan (verificado por test).
- **Patrón replicable**: 14+ rutas migradas hasta round 12 (notifications, payment-approvals approve+reject, marketplace/orders POST, marketplace/orders/[id] PATCH, invoices/emit, marketplace/referral/apply, returns, delivery/start-route, customers/[phone] PATCH+DELETE, orders POST, orders/[id] PATCH+DELETE, cron fiados-mark-vencido).

### Negativas

- **Edge runtime no soporta AsyncLocalStorage**: sólo funciona en Node runtime. Las routes API de Next 16 usan Node por default; routing middleware (`proxy.ts`) corre en Edge — NO puede usar `runWithAuditContext`. No es problema porque proxy.ts no escribe a SENSITIVE_MODELS.
- **Migración manual endpoint por endpoint**: ~40 rutas pendientes a round 12. Cada una requiere review y splitting si es grande.
- **Workers/queues** (BullMQ) corren fuera del request HTTP — necesitan setup propio: el job data debe llevar `{ ip, userId, requestId }` y el worker hacer `withAuditContext` antes de procesar.

## Alternativas consideradas

1. **Header-tunneling** (set `x-internal-ip` en proxy.ts, leer en Prisma extension via global registry): rechazado porque no hay forma de mapear request HTTP → Prisma call sin AsyncLocalStorage.
2. **Inyectar `{ ip, user }` como 2do/3er parámetro en cada DB class**: invasivo, ~50 clases × N métodos. Romperia signatures de toda lib/db/.
3. **Modificar Prisma extension para aceptar contexto explícito**: requiere wrap del prisma client en cada call site. Mismo costo que opción 2.
4. **Aceptar `ipAddress: null` y `user: "system"`**: bloqueado por compliance Ley 29733.

AsyncLocalStorage gana en: zero-touch para DB classes existentes + compatibilidad con migración gradual + aislamiento async garantizado por Node runtime.

## Referencias

- `lib/audit/audit-context.ts` — implementación + JSDoc
- `__tests__/lib/audit/audit-context.test.ts` — 5 tests (5/5 passing)
- `lib/audit/prisma-middleware.ts:339-352` — call site en writeAuditEntry
- ADR-097 — Ley 29733 audit chain (precondición)
- Pentest round 7 hallazgo M004 (commit `a26b815d`)
- Round 9 commit `77f6ec9e` — implementación inicial
- Round 10 commit `5b4f4a92` — 7 rutas + 1 cron
- Round 11 commit `89c4e6c3` — 4 handlers más
- Round 12 — orders POST/PATCH/DELETE + ADR
