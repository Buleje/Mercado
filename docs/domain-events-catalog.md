# Catálogo de Eventos de Dominio

**Última actualización:** 2026-04-06
**ADR:** `docs/adr/007-domain-events-bullmq.md`
**Módulo:** `lib/domain-events/`

---

## Contrato común

Todo evento de dominio hereda esta forma:

```ts
interface BaseDomainEvent<Type, Payload> {
  id:         string;     // UUID v4 único — usar para dedup en subscribers
  type:       Type;       // discriminador
  tenantId:   string;     // multi-tenant scope (NUNCA cross-tenant)
  occurredAt: string;     // ISO 8601
  payload:    Payload;    // datos específicos
}
```

## Reglas de oro

1. **Idempotencia obligatoria**: todo subscriber DEBE tolerar recibir el mismo evento más de una vez. Usar `event.id` para dedup en BD.
2. **Inmutabilidad**: los eventos nunca se editan después de emitirse. Si el estado cambia, emitir un nuevo evento.
3. **Fire-and-forget**: `emitDomainEvent()` nunca throws. Si falla, se loguea pero el write original sigue.
4. **Tenant-scoped**: `tenantId` es obligatorio. Los subscribers NUNCA cruzan tenants.
5. **Sin circular events**: un subscriber NO debe emitir el mismo tipo de evento que está procesando.
6. **Subscribers in-memory solo para lightweight**: cache invalidation, contadores locales. Todo lo demás va a workers BullMQ.

## Eventos registrados

### 1. `VentaCompletada`

**Emitido por:** `lib/db/orders.db.ts` → `OrdersDB.create()` después del `prisma.order.create()` exitoso.

**Payload:**
```ts
{
  orderId:       string;  // ID del pedido recién creado
  customerId?:   string;  // opcional — id de Customer si está identificado
  customerPhone: string;  // teléfono normalizado
  total:         number;  // monto en soles (recomputado server-side)
  itemCount:     number;  // cantidad de items (no unidades)
  paymentMethod: string;  // "yape" | "efectivo" | otros
  hadCoupon:     boolean; // true si se aplicó cupón
  isDelivery:    boolean; // true si es envío a domicilio
}
```

**Cuándo se emite:** Al final de `OrdersDB.create(tenantId, order)`, después del `prisma.order.create()` y del update de idempotency key. Se emite para **todos** los pedidos, incluso los marcados como "pendiente" (el estado no importa para este evento — el pedido se registró).

**Subscribers propuestos:**
| Worker | Acción |
|---|---|
| `analytics-worker` | Actualizar KPIs en vivo (ventas del día, ticket promedio) |
| `factura-worker` | Auto-emitir boleta/factura si el tenant tiene SUNAT auto-emit activado |
| `loyalty-worker` | Acreditar puntos de lealtad al cliente |
| `notification-worker` | Notificar al dueño por WhatsApp si el pedido es nocturno (>20:00) |

**NO confundir con:** el evento de cambio de estado del pedido (p. ej. `PedidoEntregado`) — ese sería un evento diferente a agregar en el futuro.

---

### 2. `StockBajo`

**Emitido por:** `lib/db/inventory.db.ts` → `InventoryDB.record()` cuando el stock del producto cruza el umbral `stockMin` de arriba hacia abajo.

**Payload:**
```ts
{
  productId:     number;
  productName:   string;
  currentStock:  number;  // stock después de la deducción
  stockMin:      number;  // umbral que acaba de cruzarse
  lastDeduction: number;  // unidades que se acaban de restar
  reason:        "venta" | "ajuste" | "merma" | "transferencia";
}
```

**Cuándo se emite:** Dentro de `InventoryDB.record()`, cuando se cumple:
- `!isIncrease` (movimiento es de reducción)
- `stockMin != null`
- `prevStock > stockMin` (antes estaba OK)
- `clampedNewStock <= stockMin` (ahora cruzó el umbral)

Solo se emite **una vez** por transición — si el stock sigue bajando, no se re-emite hasta que vuelva a subir y vuelva a bajar.

**Subscribers activos:**
| Worker | Acción |
|---|---|
| `notification-worker` (implementado en `lib/queue/workers.ts`) | Enviar WhatsApp al dueño con el detalle |

**Subscribers propuestos:**
| Worker | Acción |
|---|---|
| `reorder-worker` | Generar sugerencia de reorden automática si está dentro de un ciclo de compra programado |
| `analytics-worker` | Trackear frecuencia de stock bajo por producto para priorizar compras |

---

### 3. `FacturaEmitida`

**Emitido por:** `app/api/sunat/emit/route.ts` después de que SUNAT (vía Nubefact) retorna `sunat_accepted: true`.

**Payload:**
```ts
{
  facturaId:        string;  // ID de SunatInvoice
  orderId:          string;  // pedido asociado
  customerDocument: string;  // RUC (factura) o DNI (boleta)
  customerName:     string;
  documentType:     "factura" | "boleta" | "nota_credito";
  total:            number;  // monto con IGV incluido
  sunatHash?:       string;  // nubefact_id del response
  cdrUrl?:          string;  // enlace al PDF/CDR
}
```

**Cuándo se emite:** Solo cuando `sunatStatus === "accepted"`. NO se emite en rechazos (SUNAT los devuelve con descripción del error).

**Subscribers propuestos:**
| Worker | Acción |
|---|---|
| `email-worker` | Enviar email al cliente con PDF adjunto |
| `whatsapp-worker` | Enviar link del CDR al cliente vía WhatsApp |
| `accounting-worker` | Registrar en libro electrónico para contabilidad |
| `archive-worker` | Guardar copia del XML en Vercel Blob storage |

---

## Cómo agregar un nuevo evento

1. **Definir el tipo** en `lib/domain-events/domain-events.ts`:
   ```ts
   export type NuevoEventoEvent = BaseDomainEvent<
     "NuevoEvento",
     { campo1: string; campo2: number }
   >;
   ```

2. **Agregar al union** `DomainEvent`:
   ```ts
   export type DomainEvent = VentaCompletadaEvent | StockBajoEvent | FacturaEmitidaEvent | NuevoEventoEvent;
   ```

3. **Crear el helper** en `DomainEvents.nuevoEvento()`:
   ```ts
   nuevoEvento(tenantId: string, payload: DomainEventPayload<"NuevoEvento">): Promise<void> {
     return emitDomainEvent<NuevoEventoEvent>({
       type: "NuevoEvento",
       tenantId,
       payload,
     });
   }
   ```

4. **Agregar case en el worker** de `lib/queue/workers.ts` — el `switch` exhaustivo fuerza actualización (TypeScript error si no lo agregas).

5. **Documentar en este catálogo** con el patrón anterior.

6. **Si el evento es crítico**, considerar ADR (ver ADR 007 como ejemplo).

---

## Testing

Los eventos de dominio tienen tests unitarios en `__tests__/domain-events.test.ts` que verifican:
- Entrega a subscribers del tipo correcto
- Aislamiento entre tipos distintos
- Múltiples subscribers del mismo evento
- Unsubscribe
- IDs únicos + occurredAt ISO
- Aislamiento de fallos entre subscribers
- `emitDomainEvent` nunca throws

Al agregar un nuevo evento, agregar al menos un test que verifique que los subscribers reciben el payload esperado.

---

## Monitoreo en producción

- **BullMQ Dashboard** (en `/admin?tab=colas`): muestra el queue `domain-events` con jobs pendientes, fallidos, completados.
- **Logs estructurados**: todos los eventos tienen `logger.info('[worker/domain-events] Processing', { eventId, type, tenantId })`.
- **Sentry**: los subscribers que fallan después de los reintentos de BullMQ se capturan en Sentry automáticamente.
- **Alertas**: configurar alerta Sentry si `domain-events` queue acumula > 100 jobs fallidos en 5 min.
