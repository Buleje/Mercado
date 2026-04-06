# `lib/queue/` — Sistema de colas (BullMQ)

Procesamiento asíncrono con BullMQ 5.73 sobre Redis. Ver **ADR 003** para la decisión arquitectónica.

## Por qué existe

- Procesos lentos (envío de email, generación de PDF, sync con SUNAT, recálculo de KPIs) no deben bloquear el request HTTP.
- Permite **retry automático** con backoff exponencial.
- Cola de letras muertas (DLQ) para inspección manual.
- Dashboard interno (`lib/queue/dashboard.ts`) para monitoreo.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `connection.ts` | Singleton de conexión Redis (lazy, fail-soft sin `REDIS_URL`) |
| `queues.ts` | Definición de colas: `email`, `pdf`, `sunat`, `notifications`, `analytics` |
| `workers.ts` | Workers que consumen las colas |
| `dashboard.ts` | UI interna para inspeccionar jobs |
| `index.ts` | Barrel export |

## Convenciones

| Regla | Por qué |
|---|---|
| Nunca esperar el resultado del job en el handler HTTP | Bloquearía la respuesta |
| `tenantId` siempre en el payload del job | Multi-tenancy se mantiene en el worker |
| Idempotency key en jobs críticos (pagos, facturas) | Evita doble proceso si el worker re-intenta |
| Errores fatales → mover a DLQ, no retry infinito | Evita loops de fallos |
| Sin `REDIS_URL` → la cola **degrada a ejecución síncrona** in-process | Permite dev local sin Redis |

## Patrón de uso

```typescript
import { emailQueue } from "@/lib/queue";

// En el route handler — fire and forget
await emailQueue.add("send-receipt", {
  tenantId: auth.tenantId,
  orderId: order.id,
  to: customer.email,
}, {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
});

return NextResponse.json({ ok: true });
```

## Workers en producción

Los workers se levantan desde `instrumentation.ts` (ver `lib/queue/workers.ts`). En Vercel serverless usa el patrón de "trigger por cron" del ADR 003 — los workers se procesan cuando un cron los despierta, no como proceso permanente.

## Eventos de dominio relacionados

`lib/domain-events/` publica eventos (`VentaCompletada`, `StockBajo`, `FacturaEmitida`) sobre estas colas. Ver `docs/domain-events-catalog.md` para el listado completo.
