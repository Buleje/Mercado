---
applyTo: "lib/db/orders.db.ts, prisma/migrations/**"
---

# database-migrations — instrucciones para orders.db + migraciones con state machine

`lib/db/orders.db.ts` mantiene la state machine de Order + idempotency + reservas. Un bug aquí = doble cobro o stock corrupto.

## Archivos cubiertos

| Path | Por qué |
|---|---|
| `lib/db/orders.db.ts` | Create, transition, settle con idempotency |
| `prisma/migrations/**` | Migrations que tocan Order/OrderItem/Payment |

## State machine de Order

```
pending → paid → preparing → out_for_delivery → delivered
   ↓         ↓
cancelled  refunded
```

Transiciones permitidas solo desde el estado actual. Cualquier otro → throw `InvalidTransitionError`.

## Invariantes

1. **Idempotency key única por orden**: columna `idempotency_key` UNIQUE en tabla Order. Duplicate key → 409 con la orden existente.

2. **Atomic transitions**: la transición + los side effects (liberar stock, crear payment, notificar) van en la MISMA `prisma.$transaction`. Si falla el side effect, revert la transición.

3. **Never manually edit `status` outside orders.db.ts**. Razones:
   - Bypass del state machine.
   - No se disparan side effects.
   - El event log queda incompleto.

4. **Audit log** (`OrderEvent`): cada cambio de estado crea un event row con `previousStatus`, `newStatus`, `actorId`, `reason`, `createdAt`. Nunca deletear events.

5. **Reservas de stock**: creadas en `pending`, consumidas en `paid`, liberadas en `cancelled`/`refunded`. Un leak aquí = stock fantasma.

## Cambios que requieren ADR

- Agregar estado nuevo al state machine.
- Cambiar la matriz de transiciones permitidas.
- Agregar side effect a una transición (email, WhatsApp, webhook).
- Cambiar qué triggerea la reserva (ej. guardar como wishlist).

## Migration checklist

Ver también: `prisma-schema.instructions.md`.

- [ ] Expand→migrate→contract si la columna afecta orders existentes.
- [ ] Backfill con default NO-destructivo.
- [ ] Test que verifique que state machine sigue funcionando con DB migrada.
- [ ] DR drill: restaurar backup pre-migration y verificar rollback.

## Tests obligatorios

- Doble POST con mismo idempotency key → 1 sola orden, 2da recibe la misma.
- Transición inválida (ej. delivered → pending) → `InvalidTransitionError`.
- Cancel de orden `paid` → stock liberado + refund pendiente.
- Concurrent transitions del mismo order → 1 gana, otra recibe error (SELECT FOR UPDATE).
