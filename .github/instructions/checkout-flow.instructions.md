---
applyTo: "components/checkout/**, components/CheckoutModal.tsx, app/api/checkout/**"
---

# checkout-flow — instrucciones para editar el flujo de pago

Zona crítica: un bug aquí = usuarios sin poder pagar o cargos duplicados.

## Archivos cubiertos

| Path | Por qué |
|---|---|
| `components/CheckoutModal.tsx` | Orquesta steps, cupones, reservas |
| `components/checkout/**` | Step components (delivery, payment, confirm) |
| `app/api/checkout/**` | Endpoints de finalización, validación, idempotency |
| `lib/db/orders.db.ts` | State machine de la orden (skill database-migrations) |

## Invariantes

1. **Totales en backend** (CLAUDE.md regla #6). Cliente envía solo items + cupones; backend calcula subtotal, descuentos, envío y total. Un bug en cliente nunca afecta lo cobrado.

2. **Idempotency key obligatoria** en POST `/api/checkout/finalize`. Cada intento reusa el mismo key → evita doble cobro en reintentos. Generar con `crypto.randomUUID()` al abrir el modal.

3. **Reservas de stock** se crean antes de iniciar pago y se liberan en:
   - Confirmación exitosa (se consumen).
   - Timeout (5 min default — revisar `lib/db/orders.db.ts`).
   - Cancelación explícita.

4. **Cupones se validan server-side**. Nunca confiar en el descuento calculado en cliente. Re-aplicar en el endpoint de finalize.

5. **Payment provider adapters**: Stripe / Culqi / Yape / efectivo. Cada uno en archivo separado. Nunca mezclar lógica de provider con lógica de orden.

## Flujo canónico

```
1. User click "Pagar"
2. Modal abre con step "delivery"
3. User completa dirección → step "payment"
4. Selección de método → se crea reserva de stock
5. POST /api/checkout/start → returns idempotencyKey + preferenceId (Culqi) / clientSecret (Stripe)
6. Cliente dispara SDK del provider
7. Webhook del provider → actualiza Order status
8. Cliente polleá /api/orders/[id] o SSE → muestra confirmación
```

## Cambios que requieren ADR

- Agregar/quitar payment provider.
- Cambiar el shape de `IdempotencyKey` o `orderId`.
- Mover lógica de totales al cliente.
- Quitar el polling / SSE de confirmación.

## Tests obligatorios (antes de mergear)

- e2e: happy path con cada payment provider.
- e2e: doble click en "Pagar" → una sola orden creada (idempotency).
- e2e: timeout de reserva → stock liberado.
- unitario: cupón inválido → 400, no modifica total.
- unitario: total backend != total cliente → 400 con error claro.

## Handshake

Antes de editar:
- [ ] ¿Afecta el total cobrado? (si sí → test obligatorio backend)
- [ ] ¿Afecta idempotency? (si sí → doble-click test)
- [ ] ¿Afecta reservas de stock? (si sí → timeout test)
- [ ] ¿Nuevo provider? (si sí → ADR)
