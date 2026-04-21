---
applyTo: "app/api/batches/**, lib/db/batches.db.ts"
---

# fefo-inventory — instrucciones para batches y expiración

FEFO (First Expired, First Out). Un bug aquí = vender productos vencidos o reportar stock fantasma.

## Archivos cubiertos

| Path | Por qué |
|---|---|
| `app/api/batches/**` | Endpoints de batches (CRUD, expiring, expired) |
| `lib/db/batches.db.ts` | Consultas optimizadas + invalidación de cache |
| `components/admin/BatchesTab*` | UI de gestión |

## Invariantes

1. **`expiryDate` vs `expiresAt`**: el schema Prisma usa `expiryDate`. Alias `expiresAt` en response = bug — causó la confusión de TD-? Si ves `expiresAt` en código, reemplazar.

2. **Orden FEFO al vender**: `lib/db/orders.db.ts` al crear items consume batches ordenados por `expiryDate ASC NULLS LAST`. Si una migración cambia el orden, stock rota mal.

3. **Vencidos NO se venden**: filtro `where: { expiryDate: { gte: now } }` en todas las queries de venta. Admin puede VER los vencidos en su tab, pero no se ofrecen al cliente.

4. **Expiring window**: default 7 días. Ver `BATCH_EXPIRING_DAYS` en constants. Cambiarlo rompe badges en UI cliente ("Por vencer").

5. **Quantity nunca negativa**: reducer debe validar `current - consumed >= 0`. Si es negativo, rechazar y revert reserva.

## Tests obligatorios

- Crear 2 batches del mismo producto, expiry distinto → al vender, consume el más próximo primero.
- Batch vencido → NO aparece en listado del cliente.
- Batch expiring (< 7 días) → aparece con badge "Por vencer".
- Concurrent sales del mismo batch → no permite negative quantity.

## Cambios que requieren ADR

- Cambiar orden FEFO (ej. LIFO).
- Renombrar `expiryDate` ↔ `expiresAt`.
- Cambiar la ventana de "expiring".
- Permitir venta de vencidos (solo admin).

## Handshake

- [ ] ¿Toca orden de consumo? (si sí → test FEFO)
- [ ] ¿Toca filtros de "disponible"? (si sí → test vencidos no se muestran)
- [ ] ¿Consume stock? (si sí → test quantity no-negativa)
