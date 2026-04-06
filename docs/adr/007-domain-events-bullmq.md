# ADR-007: Eventos de dominio sobre BullMQ

## Estado
✅ Aceptada

## Fecha
2026-04-06

## Contexto

Los módulos del ERP están actualmente acoplados vía llamadas directas. Cuando se completa una venta en `lib/db/orders.db.ts`:
- El mismo método ejecuta la recomputación de stock
- Luego llama a `enqueueActivityLog()` para auditoría
- Luego llama a `enqueueNotification()` para WhatsApp
- Luego debería disparar factura electrónica
- Luego debería alimentar analytics y forecasting

Esto viola **Open/Closed** (cada nueva reacción a "venta completada" implica editar `orders.db.ts`) y hace imposible que el módulo de analytics, por ejemplo, reaccione a ventas sin conocer el módulo de pedidos.

Necesitamos **Event-Driven Architecture** para desacoplar módulos, pero sin introducir Kafka u otra pieza de infraestructura — ya tenemos BullMQ corriendo sobre Redis (ADR 003).

## Opciones consideradas

### Opción A: Llamadas directas (status quo)
- ✅ Simple de leer
- ✅ Stack trace claro
- ❌ Acoplamiento alto entre módulos
- ❌ Cada nueva reacción requiere editar el emisor
- ❌ Imposible reaccionar a eventos desde módulos nuevos sin tocar los viejos
- ❌ Tests de unidades difíciles — mockear todas las dependencias

### Opción B: Kafka o RabbitMQ dedicado
- ✅ Event sourcing real, particionado por tenant
- ✅ Retención larga, replay de eventos
- ❌ Infraestructura adicional que NO tenemos
- ❌ Overkill para el volumen actual (< 100 eventos/seg)
- ❌ Complejidad operacional (Zookeeper, brokers, topics)

### Opción C: Eventos de dominio sobre BullMQ (elegida)
- ✅ Reutiliza infraestructura existente (Redis + BullMQ ya en ADR 003)
- ✅ Durabilidad (at-least-once) sin servidores extra
- ✅ Reintentos automáticos con backoff exponencial
- ✅ Subscribers viven en workers independientes — escala horizontal gratis
- ✅ Fallback in-memory cuando no hay Redis (dev local sin Redis sigue funcionando)
- ❌ Un solo queue compartido — ordering per-tenant es best-effort
- ❌ No hay replay histórico después de N días
- ❌ No es event sourcing puro (los eventos no son fuente de verdad)

### Opción D: EventEmitter de Node.js en memoria
- ✅ Cero infraestructura
- ❌ Pérdida total si el proceso muere
- ❌ No cruza instancias en Vercel (cada Function es un proceso distinto)
- ❌ Inaceptable para un ERP con dinero real

## Decisión

Elegimos la **Opción C**: Eventos de dominio sobre BullMQ en `lib/domain-events/`.

Arquitectura:

```
┌─────────────────┐    emitDomainEvent()    ┌──────────────────┐
│ DB Class        │ ──────────────────────> │ domain-events    │
│ (orders.db.ts)  │                         │  BullMQ queue    │
└─────────────────┘                         └────────┬─────────┘
                                                     │
                                                     v
                    ┌────────────────────────────────┴───────────────────────────┐
                    │                                                            │
                    v                                                            v
          ┌───────────────────┐                                        ┌───────────────────┐
          │ Worker: Analytics │                                        │ Worker: SUNAT     │
          │ (suma KPIs)       │                                        │ (emite factura)   │
          └───────────────────┘                                        └───────────────────┘
```

### Eventos iniciales (v1)

| Evento | Emitido por | Payload clave |
|---|---|---|
| `VentaCompletada` | `orders.db.ts` tras `create()` | `orderId`, `total`, `itemCount`, `paymentMethod` |
| `StockBajo` | `inventory.db.ts` tras `decrementFEFO` cuando cruza `stockMin` | `productId`, `currentStock`, `stockMin` |
| `FacturaEmitida` | `finance.db.ts` tras recibir OK de SUNAT | `facturaId`, `orderId`, `sunatHash` |

### Reglas

1. **Eventos inmutables**: nunca se editan después de emitirse.
2. **Idempotencia obligatoria**: cada subscriber DEBE tolerar recibir el mismo evento más de una vez (usar `event.id` para dedup).
3. **Tenant-scoped**: `tenantId` obligatorio. Los subscribers NUNCA cruzan tenants.
4. **Fire-and-forget**: `emitDomainEvent()` NO throws. Si falla, se loguea pero el write original sigue.
5. **Un solo queue `domain-events`**: con filter por `type` en los workers. Evitamos queue explosion.
6. **Subscribers in-memory solo para cache invalidation** — todo lo demás va a workers BullMQ.

## Consecuencias

### Positivas
- Nuevos módulos pueden reaccionar a eventos existentes sin tocar el emisor
- Tests unitarios más fáciles: mockear `emitDomainEvent` en vez de N dependencias
- Auditoría automática: toda emisión queda en BullMQ para inspección
- Preparación para futuro event sourcing si crece el volumen

### Negativas
- Dev local necesita Redis para experiencia completa (hay fallback in-memory)
- Debuggear un flujo cross-módulo requiere seguir eventos por Bull Board
- Ordering cross-módulo es best-effort (mismo queue, mismo tenant ≈ orden)
- Latencia extra de 10-50ms por evento emitido (negligible)

### Riesgos
- **Tormentas de eventos**: si un subscriber falla y reintenta, puede generar cascada. Mitigación: backoff exponencial + `removeOnFail: 10000`.
- **Subscribers duplicados**: si el mismo worker se instancia 2 veces, procesa el evento 2 veces. Mitigación: idempotencia obligatoria + dedup por `event.id` en DB.
- **Pérdida de eventos si Redis cae**: fallback in-memory mitiga parcialmente. Alertar en Sentry si `getQueueConnection()` devuelve null en producción.

## Próximos pasos

1. ✅ Crear `lib/domain-events/domain-events.ts` con los 3 eventos iniciales
2. ⏳ Integrar `DomainEvents.ventaCompletada()` en `orders.db.ts` después de `create()`
3. ⏳ Integrar `DomainEvents.stockBajo()` en `inventory.db.ts` después de `decrementFEFO()`
4. ⏳ Integrar `DomainEvents.facturaEmitida()` en `finance.db.ts` después de SUNAT OK
5. ⏳ Crear workers en `lib/queue/workers.ts` para consumir `domain-events`
6. ⏳ Documentar en `docs/` el catálogo de eventos + subscribers activos
