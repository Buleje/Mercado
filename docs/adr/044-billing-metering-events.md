# ADR 044 — Billing Metering via ActivityLog

**Estado:** Implementado + tests
**Fecha:** 2026-04-10
**Autor:** Claude (ingeniero-jefe) — sesion `luis` modo maximo
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #8 — ROI "5x ARPU unlock" via billing por uso real

---

## Contexto

`lib/usage.ts` + `/api/billing/usage` calculan uso **reactivo**: cuentan productos, usuarios y ordenes del mes directo de Prisma cada vez que el dashboard los pide. Funciona para limites basicos, pero tiene 3 limitantes:

1. No cuenta eventos no-modelados (llamadas a AI, SMS, WhatsApp, blob storage)
2. No es idempotente — si un worker manda dos veces "ai.call" no hay manera de detectarlo
3. No permite pivotar por tipo de evento para facturacion granular ("pagaste S/X por Y llamadas a IA")

Sin metering por evento no se puede montar el modelo "5x ARPU" del roadmap (ADR 016 Tier S #8).

## Decision

Implementar metering por evento **sin migrations**, reutilizando el modelo `ActivityLog` existente como event store.

### Mapeo

| Campo ActivityLog | Metering equivalente |
|-------------------|---------------------|
| `tenantId` | tenant isolation (regla #3 CLAUDE.md) |
| `entity` | constante `"usage.meter"` — filtro rapido |
| `action` | `MeteredEvent` (enum cerrado) |
| `entityId` | `idempotencyKey` opcional — unicidad 60min |
| `detail` | JSON: `{ amount, metadata, recordedAt }` |

### Eventos facturables

```ts
const METERED_EVENTS = [
  "order.created",
  "ai.call",
  "ai.recommend",
  "ai.insight",
  "sms.sent",
  "whatsapp.sent",
  "sunat.emitted",
  "storage.blob",
] as const;
```

### API

| Endpoint | Metodo | Proposito |
|----------|--------|-----------|
| `/api/billing/meter` | POST | Registra evento (admin/cajero) con idempotency opcional |
| `/api/billing/meter` | GET | Agrega por tipo en el periodo (default: mes corriente) |

### Archivos creados

| Archivo | Proposito |
|---------|-----------|
| `lib/billing/metering.ts` | `recordUsageEvent` + `getMeteredUsage` + `currentBillingMonth` |
| `app/api/billing/meter/route.ts` | POST + GET con requireAdmin |
| `__tests__/billing-metering.test.ts` | 9 tests (record valido, amount invalido, cap, idempotency, agregacion) |

### Idempotency

Si el caller pasa `idempotencyKey`, la libreria busca un row con el mismo `entityId` en `usage.meter` en la ultima hora. Si existe, es no-op (`return false`). Ventana de 60min es suficiente para casos reales (retries de BullMQ, webhooks duplicados, reintento de worker).

## Alternativas evaluadas

1. **Crear un nuevo modelo UsageEvent** — mejor a largo plazo, pero requiere migration. Este ADR opta por shipping rapido; el ADR futuro (045?) hara la migracion cuando el volumen justifique.
2. **Redis counter** — rapido pero no auditable. Descartado para facturacion.
3. **Stripe Metered Billing API directo** — coupling fuerte con Stripe + no nos deja agregar internamente antes de reportar.

## Consecuencias

### Positivas
- Cero migrations — deploy en minutos
- Auditable: cada row es una fila fisica con timestamp
- Idempotente con ventana razonable
- Compatible con Ley 29733 (audit log inmutable ya existe)
- Abre la puerta a:
  - Endpoint de Stripe meter report (cron diario)
  - Dashboard admin "usage this month by type"
  - Alertas de hard cap por evento

### Negativas / riesgos
- Agregacion por SQL es O(rows) — a 100k eventos/mes/tenant el GET puede ponerse lento. Mitigacion: crear indice compuesto `(tenantId, entity, createdAt)` cuando lo necesitemos (query ya va por esos campos)
- `JSON.parse` de cada row es CPU-bound — si se vuelve bottleneck, cachear con `"use cache"` en el GET con `cacheLife({ revalidate: 60 })`

### Seguridad
- tenantId viene del session (requireAdmin), nunca del body — previene cross-tenant write
- Amount capped a 10,000 por evento — anti-abuse
- Schema Zod con `enum` cerrado — valores arbitrarios rechazados

## Proximos pasos (siguiente sesion)

1. Instrumentar callers reales:
   - `lib/ai/recommender.ts` -> `recordUsageEvent("ai.recommend", 1)`
   - `lib/ai/daily-insights.ts` -> `recordUsageEvent("ai.insight", 1)`
   - `lib/whatsapp-bot.ts` -> `recordUsageEvent("whatsapp.sent", 1, idempotencyKey: msgId)`
   - `app/api/orders/[id]/route.ts` (delivered) -> `recordUsageEvent("order.created", 1)`
2. Crear cron `app/api/cron/meter-to-stripe/route.ts` que reporta el agregado diario a Stripe
3. Agregar card al admin dashboard "Uso facturable este mes"

## Referencias

- `lib/usage.ts` — complementa (usage actual vs limites del plan)
- `lib/activity-logger.ts` — convencion de ActivityLog
- ADR 016 — plan maestro 24 semanas (Tier S item #8)
- ADR 036 — compliance Ley 29733 (audit log immutable)
- CLAUDE.md reglas #2 (safeParse), #3 (tenantId), #9 (requireAdmin)
