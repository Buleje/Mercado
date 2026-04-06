# `components/checkout/` — Flujo de checkout refactorizado

**Antes:** `CheckoutModal.tsx` era un monolito de 1333 líneas con 55+ `useState`.
**Ahora:** orquestador < 250 líneas + steps + hooks aislados + `useReducer`.

`components/CheckoutModal.tsx` es solo un re-export para mantener el path de import legacy.

## Estructura

```
checkout/
├── CheckoutModal.tsx          # Orquestador (state machine + render del step activo)
├── index.ts                   # Barrel export
├── types.ts                   # Step, PaymentMethod, Customer, Coupon, etc.
│
├── steps/                     # Pasos del wizard
│   ├── StepDatos.tsx
│   └── StepPago.tsx
│
├── hooks/                     # Lógica aislada y testeable
│   ├── useCheckoutState.ts        # Reducer único (reemplaza los 55 useState)
│   ├── useCheckoutInit.ts         # Inicialización del wizard
│   ├── useCheckoutHandlers.ts     # Handlers de UI
│   ├── useCheckoutSubmit.ts       # Submit final
│   ├── checkout-submit-helpers.ts # Helpers puros del submit
│   ├── useCoupon.ts               # Validación y aplicación de cupones
│   ├── useLoyalty.ts              # Puntos y tier de lealtad
│   ├── useDniLookup.ts            # Lookup RENIEC por DNI
│   ├── usePhoneSearch.ts          # Búsqueda de cliente por teléfono
│   ├── useGeolocation.ts          # Geo + reverse geocode
│   ├── useStockCheck.ts           # Verificación de stock antes de pagar
│   └── usePendingOrders.ts        # Pedidos pendientes del cliente
│
├── parts/                     # UI puras y reutilizables
│   ├── CheckoutModalShell.tsx     # Shell del modal
│   ├── CheckoutModalHeader.tsx
│   ├── MiniCartSummary.tsx
│   ├── CustomerVerifiedCard.tsx
│   ├── CustomerFormFields.tsx
│   ├── AddressInput.tsx
│   ├── SavedAddressList.tsx
│   └── phone-validation.ts        # Helpers puros de validación PE
│
├── StepBar.tsx                # Barra de progreso
├── CheckoutAccountStep.tsx
├── CheckoutSuccessStep.tsx
├── CheckoutDeliverySchedule.tsx
├── CheckoutOrderReview.tsx
├── CheckoutPaymentSection.tsx
├── CheckoutNotesField.tsx
├── CashChangeCalculator.tsx   # Cálculo de vuelto en efectivo
├── FreeDeliveryBanner.tsx
├── YapePaymentPanel.tsx
└── PlinPaymentPanel.tsx
```

## Convenciones críticas

| Regla | Por qué |
|---|---|
| **Toda lógica nueva → un hook**, nunca dentro del step | Tests aislados sin renderizar el modal completo |
| **Estado vive en `useCheckoutState`** (un solo reducer) | Una sola fuente de verdad |
| **Componentes en `parts/`** son **puros** (sin fetches) | Reutilizables en otros flujos |
| **No calcular totales en cliente** — siempre confirmar contra el backend | Evita fraude y descuadres |
| Cupones, lealtad y stock se validan **server-side** antes del submit final | Idempotencia + seguridad |

## Zona de peligro

Este flujo toca:
- Pagos (Yape, Plin, efectivo)
- Cupones y descuentos
- Reservas de stock
- Puntos de lealtad
- Datos personales (DNI, teléfono, dirección)

**Reglas:**
1. Cualquier cambio requiere correr `__tests__/checkout/` completo.
2. Probar manualmente: pedido con cupón válido, cupón inválido, Yape, efectivo, dirección guardada, dirección nueva, DNI ok, DNI falla.
3. NO mergear sin smoke en dev.

## Tests

```bash
npm run test -- checkout
```

Hooks testeados aislados: `useCoupon`, `useDniLookup`, `useGeolocation`, `usePhoneSearch`, `useCheckoutState`.

## Histórico

- **Fase 1:** Helpers puros extraídos a `lib/geo-utils.ts` y `parts/phone-validation.ts`.
- **Fase 2:** Steps del wizard divididos a `steps/`.
- **Fase 3:** 55 `useState` migrados a un único `useReducer` (`useCheckoutState.ts`).
- **Fase 4:** Tests por hook (red de seguridad).
- **Resultado:** `CheckoutModal.tsx` raíz quedó como re-export de 16 líneas.
