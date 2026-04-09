# ADR 015 — Step "Confirmar" en CheckoutModal con `footerSlot` del shell

**Status:** Accepted
**Date:** 2026-04-08
**Related:** ADR 001 (multi-tenancy), `components/checkout/**` refactor previo (monolito 1333 LoC → steps + hooks + useReducer)

## Context

El `CheckoutModal` (el de la barra lateral del carrito) tenía 4 pasos: `cuenta → datos → pago → exito`. El paso `pago` hacía submit directo: el cliente apretaba "Confirmar" y se enviaba la orden en el acto.

Al mismo tiempo, el `MarketplaceCheckoutModal` (el de la página "tienda individual" del marketplace) tenía **5 pasos** incluyendo un paso dedicado `confirmacion` entre `pago` y el submit final. Ahí el comprador ve un resumen de todo (datos, dirección, método de pago, items, totales) antes de confirmar. Esto reduce drop-off por errores del cliente (dirección mal tipeada, método de pago equivocado, cantidad incorrecta) porque le da una última oportunidad de revisar.

**Requerimiento:** replicar ese paso "Confirmar" también en el `CheckoutModal` normal, con el mismo nivel de pulido visual (footer CTA sticky con botón gradient, trust badges).

**Restricción:** no romper los 75 tests unitarios existentes del checkout ni el e2e de `checkout.spec.ts`.

## Decision

Agregar un nuevo step `confirmar` al wizard y dividir la pantalla en dos piezas que se ensamblan desde el orquestador:

1. **`StepConfirmar`** — contenido scrolleable: encabezado + 5 cards (datos, dirección, pago, productos, totales).
2. **`StepConfirmarFooter`** — footer sticky exportado desde el mismo archivo: botón CTA gradient primary→emerald con el total en el label (`Confirmar pedido · S/XX.XX`), botón atrás, trust badges.

Para que el footer quede **siempre anclado al borde inferior del modal** (aunque el resumen scrollee), se introduce un prop nuevo **`footerSlot`** en `CheckoutModalShell`. Este slot se renderiza **fuera del área `flex-1 overflow-y-auto`** del shell, garantizando que no entre al scroll del contenido.

### Pieza clave — el shell expone `footerSlot`

```tsx
// CheckoutModalShell.tsx (simplificado)
<div className="flex-1 overflow-y-auto">{children}</div>
{footerSlot && (
  <div className="shrink-0 border-t bg-white/90 backdrop-blur-sm">
    {footerSlot}
  </div>
)}
```

Esto mantiene a los demás pasos (`cuenta`, `datos`, `pago`, `exito`) sin cambios: si no se pasa `footerSlot`, el shell se comporta igual que antes.

### Wiring en `CheckoutModal.tsx`

```tsx
const confirmarFooter = state.step === "confirmar" ? (
  <StepConfirmarFooter
    submitting={state.ui.submitting}
    submitError={state.ui.submitError}
    finalTotal={finalTotal}
    onBack={() => dispatch({ type: "SET_STEP", step: "pago" })}
    onConfirm={handlers.handleFinalConfirm}
  />
) : null;

<CheckoutModalShell footerSlot={confirmarFooter} ...>
  {state.step === "confirmar" && (
    <StepConfirmar ... onEditAddress={() => dispatch({ type: "SET_STEP", step: "datos" })} />
  )}
</CheckoutModalShell>
```

### Cambio del flow de submit

Antes: `handlePaymentSubmit` → `submit()` directo.
Después: `handlePaymentSubmit` → `dispatch({ SET_STEP: "confirmar" })`; nuevo `handleFinalConfirm` hace el submit real desde el footer.

Esto preserva la máquina de estados (`submitting`, `submitError`, `orderId`) intacta — solo se mueve el punto de disparo.

## Alternativas consideradas (y descartadas)

1. **Sticky footer dentro del `StepConfirmar` con `position: sticky; bottom: 0`.**
   Descartado: dentro de `AnimatePresence + motion.div`, el sticky pegaría al borde del `motion.div`, no del viewport del scroll container — solo funciona si el motion div mide toda la altura del scroll, lo que rompe la animación de exit.

2. **Doble wrap: `motion.div` con `flex flex-col h-full` interno.**
   Descartado: romperse con el `overflow-y-auto` del shell (double scroll), y requiere que el shell elimine su overflow en el step confirmar — rompe invariante del shell.

3. **Mover el footer a cada step individual (pattern per-step).**
   Descartado: los otros 3 steps (`cuenta`, `datos`, `pago`) ya tienen su propio botón inline adentro del form. Duplicar patrones hace el código menos consistente.

4. **Submit desde el paso `pago` directo, sin step nuevo.**
   Descartado: es el status quo que queremos cambiar. La meta es reducir errores de último momento.

5. **Usar `createPortal` a `document.body` para el footer.**
   Descartado: rompe el stacking context del modal y complica el manejo de foco/accesibilidad.

## Consequences

### Positivas

- **Menos drop-off**: el cliente revisa antes de confirmar, igual que en el marketplace.
- **Consistencia visual 1:1 con MarketplaceCheckoutModal**: el footer CTA con total en el botón + trust badges es el mismo patrón.
- **Reutilizable**: `footerSlot` en el shell queda como API — cualquier step futuro que necesite un footer sticky puede usarlo (ej. un futuro paso "Facturación" o "Delivery scheduling").
- **Test surface ampliada**: nuevo `e2e/checkout-confirmar-step.spec.ts` con 3 tests (pantalla aparece, botón atrás regresa, botón editar regresa a datos).
- **Cero regresiones**: 75 tests unitarios siguen verdes + lint + tsc limpios.

### Negativas

- **+1 click por compra**: cada orden ahora requiere 1 click extra (pago "Continuar" → confirmar "Confirmar pedido"). Mitigación: el label del botón final incluye el total, así el cliente sabe exactamente qué está pagando — el click se justifica solo.
- **Superficie de estado ligeramente mayor**: Step union type pasa de 4 a 5 valores; los reducers que no sean `step`-aware deben contemplarlo (no se vio ninguno en el code review).
- **Nueva capa de responsabilidad en el shell**: `CheckoutModalShell` ahora conoce la noción de "footer". Costo bajo — es un slot opcional, shrink-0, sin lógica.

## Implementation notes

- **Archivos tocados:**
  - `components/checkout/StepBar.tsx` — agrega `"confirmar"` al union + 3 círculos numerados
  - `components/checkout/steps/StepConfirmar.tsx` — **nuevo**, exporta `StepConfirmar` + `StepConfirmarFooter`
  - `components/checkout/parts/CheckoutModalShell.tsx` — nuevo prop `footerSlot`
  - `components/checkout/CheckoutModal.tsx` — wiring del nuevo step + pase del footerSlot
  - `components/checkout/hooks/useCheckoutHandlers.ts` — `handlePaymentSubmit` ahora va a `confirmar`; nuevo `handleFinalConfirm`
  - `e2e/checkout-confirmar-step.spec.ts` — **nuevo**, 3 tests Playwright

- **Verificación:**
  - `npx tsc --noEmit` → 0 errores
  - `npm run lint` sobre archivos tocados → 0 warnings
  - `npm run test -- __tests__/checkout` → 75/75 verde

- **Patrón a reutilizar**: cualquier step futuro que necesite un CTA anclado → exportar `XxxFooter` aparte del contenido y pasarlo como `footerSlot`.

## Security impact

- **Ninguno.** El nuevo step es puramente presentacional. No agrega rutas nuevas, no expone datos nuevos (solo muestra lo que ya está en el estado client-side), y el submit final sigue pasando por los mismos handlers con `requireAdmin` / cookies de tenant.
- El header del step confirmar NO permite editar el método de pago directamente — solo ofrece un link "Editar" que vuelve al paso pago. Los totales se siguen recalculando en el servidor (regla crítica del CLAUDE.md).

## Related docs

- `components/checkout/steps/StepConfirmar.tsx` — implementación
- `components/marketplace/MarketplaceCheckoutModal.tsx` — referencia del patrón original (líneas 930-1101 para el footer)
- `docs/refactor-giant-files-plan.md` — plan del refactor previo del monolito
