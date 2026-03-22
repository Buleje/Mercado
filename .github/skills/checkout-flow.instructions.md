---
applyTo: "**/CheckoutModal*,**/checkout/**"
---

# Checkout Flow — LEER ANTES DE TOCAR CheckoutModal.tsx

## ⚠️ Archivo de peligro: components/CheckoutModal.tsx (119 KB)

Este archivo contiene el flujo completo de compra. Modificarlo sin entender
el estado completo puede romper pagos, stock, coupons y notificaciones.

## Sub-componentes (ya extraídos)

```
components/checkout/
  StepBar.tsx          — Barra de progreso multi-paso
  YapePaymentPanel.tsx — Panel de pago Yape con validación de operación
  CashChangeCalculator.tsx — Calculadora de cambio para pagos en efectivo
```

## Flujo de pasos

```
1. CARRITO     → Resumen de items, subtotal, descuentos
2. CLIENTE     → Nombre, teléfono, dirección de entrega
3. PAGO        → Selección método: Yape | Efectivo
   └─ Yape     → Número de operación Yape (obligatorio)
   └─ Efectivo → Monto entregado → calcula cambio automático
4. CONFIRMACIÓN → Reserva stock, crea orden, notifica, aplica loyalty
```

## handleSubmit() — 140+ líneas, NO modificar sin leer completo

El submit hace en secuencia:
1. Validar datos del formulario
2. Verificar stock disponible (server-side)
3. Aplicar cupón/promoción si existe
4. Crear orden en la DB → `OrdersDB.create()`
5. Decrementar stock (FEFO si hay lotes)
6. Aplicar loyalty points
7. Enviar notificación push al cliente
8. Limpiar carrito (BroadcastChannel para otros tabs)

## Reglas críticas

- **Totales SIEMPRE server-side** — nunca confiar en totales del cliente
- **Cupones** — validar vigencia y límite de uso en el servidor
- **Stock reservation** — decremento ocurre al confirmar, no al agregar al carrito
- **Yape** — número de operación es string, no número
- **Deuda del cliente** — campo `deuda` en Order model, puede ser negativo (crédito)
- **idempotencyKey** — generado en el cliente, validado server-side para evitar duplicados

## Estado del componente (variables clave)

```typescript
const [step, setStep] = useState<1|2|3|4>(1);
const [paymentMethod, setPaymentMethod] = useState<"yape"|"efectivo">("efectivo");
const [yapeOperationNumber, setYapeOperationNumber] = useState("");
const [cashGiven, setCashGiven] = useState(0);
const [appliedCoupon, setAppliedCoupon] = useState<Coupon|null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);
```

## Gotchas

- **No modificar `handleSubmit()`** sin leer las 140 líneas completas — hay side effects críticos
- **`cashGiven` es número** — no string — validar antes de calcular cambio
- **El cupón puede reducir el total a 0** — manejar caso edge de total cero
- **Doble submit** — `isSubmitting` previene esto — no remover el guard
- **Notificaciones push** son fire-and-forget — no await en el submit flow
- **BroadcastChannel** limpia cart en TODOS los tabs abiertos al confirmar

## Anti-patrones

- NO calcular descuentos en el cliente
- NO skipear la validación de stock antes de crear la orden
- NO remover `isSubmitting` guard — causará órdenes duplicadas
- NO usar `.parse()` de Zod — usar `.safeParse()`
