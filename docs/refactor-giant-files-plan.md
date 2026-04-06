# Plan de Split — Archivos Gigantes

**Fecha:** 2026-04-06
**Objetivo:** Reducir `app/admin/page.tsx` y `components/CheckoutModal.tsx` a < 400 líneas cada uno, respetando SRP, Clean Code y YAGNI sin romper funcionalidad.

---

## Archivo 1 — `app/admin/page.tsx` (3996 líneas, 214 KB)

### Radiografía actual

| Sección | Líneas aprox. | Responsabilidad | Estado |
|---|---:|---|---|
| Imports + `dynamic()` de módulos | 1–134 | 30+ imports dinámicos de tabs | OK — mantener |
| `TabSpinner` | 46 | Loading fallback | Extraer |
| `Tab` type definition | 136–176 | Type union de 30+ tabs | Extraer |
| `TAB_MIGRATION` map | 180–457 | Legacy tab ID → nuevo ID | Extraer |
| **`OrdersTab` embebido** | **458–~2000** | **Componente completo con 60+ useState** | **EXTRAER URGENTE** |
| `NavDefaultTabsConfig` | 2037–2095 | Componente config de defaults | Extraer |
| `AdminPage` principal | 2097–3990 | Layout, sidebar, header, modals, routing | Dividir |
| `AdminPageNoSSR` export | 3992 | NoSSR wrapper | Mantener |

### Plan de extracción (7 pasos, orden importa)

#### Paso 1 — Extraer tipos y constantes (bajo riesgo)
Crear:
- `app/admin/_lib/tabs.types.ts` → `Tab` type
- `app/admin/_lib/tab-migration.ts` → `TAB_MIGRATION` map
- `app/admin/_lib/tab-spinner.tsx` → `TabSpinner` component

**Impacto:** -350 líneas. **Riesgo:** Nulo. **Verificación:** `npx tsc --noEmit` + `npm run lint`.

#### Paso 2 — Extraer `OrdersTab` a su propio componente (alto impacto)
Crear `components/admin/OrdersTab/` con:
```
OrdersTab/
├── index.tsx                  # Orquestador principal (<300 líneas)
├── OrdersList.tsx              # Tabla de pedidos
├── OrdersFilters.tsx           # Filtros avanzados (9 estados)
├── OrdersBulkActions.tsx       # Bulk status update
├── OrdersDetailPanel.tsx       # Panel de detalle con admin notes
├── OrdersArchive.tsx           # Vista de archivo
├── OrdersPrintPreview.tsx      # Vista de impresión
├── hooks/
│   ├── useOrdersData.ts        # Fetch + state orders
│   ├── useOrdersFilters.ts     # Lógica de filtros (migrate 9 useState → 1 useReducer)
│   ├── useDeliveryDriver.ts    # Assign driver
│   └── useOrderBulkActions.ts  # Bulk select + update
└── types.ts                    # OrderStatus, OrderFilters, etc.
```

Ruta del import en `page.tsx`:
```tsx
const OrdersTab = dynamic(() => import("@/components/admin/OrdersTab"), { loading: TabSpinner });
```

**Impacto:** -1500 líneas de `page.tsx`. **Riesgo:** Medio (muchos handlers + side effects). **Verificación:**
1. `npm run test` (buscar tests de pedidos)
2. Probar en dev: crear pedido, cambiar status, filtrar, bulk update, asignar driver, archivar.
3. Playwright smoke del flujo completo.

#### Paso 3 — Extraer `NavDefaultTabsConfig`
Mover a `components/admin/NavDefaultTabsConfig.tsx`. **Impacto:** -60 líneas. **Riesgo:** Nulo.

#### Paso 4 — Extraer hooks del `AdminPage` principal
Los 50+ `useState` del `AdminPage` se pueden agrupar en hooks de dominio:

Crear `app/admin/_hooks/`:
- `useAdminTabs.ts` — tab state + favoritos + recent + migration
- `useAdminLayout.ts` — mobileNavOpen, compactMode, focusMode, presentationMode
- `useKeyboardShortcuts.ts` — handler de shortcuts (líneas 2371+)
- `useStoreMode.ts` — WhatsApp vs otros modos
- `useClearDemo.ts` — flujo de limpiar datos demo
- `useAdminResize.ts` — resize listener + mobile table cards
- `useImpersonation.ts` — exit impersonation + logout
- `useAdminSSE.ts` — connect SSE (línea 2571)

**Impacto:** -800 líneas. **Riesgo:** Medio-Alto (hooks con side effects y SSE).

#### Paso 5 — Extraer sub-componentes de layout
Crear `components/admin/layout/`:
- `AdminSidebar.tsx` — sidebar con search, categorías, favoritos, recent
- `AdminHeader.tsx` — header con logo, breadcrumbs, user menu, mobile toggle
- `AdminMobileNav.tsx` — drawer mobile
- `AdminModulePicker.tsx` — module manager modal
- `AdminShortcutsModal.tsx` — modal de shortcuts
- `AdminClearDataDialog.tsx` — diálogo de confirmación de 3 pasos

**Impacto:** -700 líneas. **Riesgo:** Medio.

#### Paso 6 — Extraer el switch de renderizado de tabs
Crear `app/admin/_components/TabRouter.tsx` — el gran switch `tab === "x" && <XModule />`. Recibe `tab` como prop y renderiza el módulo correspondiente.

**Impacto:** -300 líneas. **Riesgo:** Bajo.

#### Paso 7 — Validar resultado final
`page.tsx` final esperado:
```tsx
"use client";
import { AdminLayout } from "./_components/AdminLayout";
import { TabRouter } from "./_components/TabRouter";
import { useAdminTabs } from "./_hooks/useAdminTabs";
import { useAdminLayout } from "./_hooks/useAdminLayout";
// ...

function AdminPage() {
  const { tab, setTab, favorites, recent } = useAdminTabs();
  const layout = useAdminLayout();
  // ...
  return (
    <AdminLayout {...layout}>
      <TabRouter tab={tab} />
    </AdminLayout>
  );
}

export default dynamic(() => Promise.resolve(AdminPage), { ssr: false });
```

**Target final:** < 300 líneas en `page.tsx`.

### Criterios de aceptación (admin/page.tsx)

- [ ] `page.tsx` < 300 líneas
- [ ] Ningún componente extraído > 400 líneas
- [ ] Ningún hook > 100 líneas
- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run lint` limpio
- [ ] `npm run test` igual o más tests pasando
- [ ] `npm run build` sin regresiones de bundle
- [ ] Smoke manual: cargar cada una de las 30+ tabs sin error
- [ ] Playwright e2e: flujo completo admin (login → pedido → cambio status → logout)

---

## Archivo 2 — `components/CheckoutModal.tsx` (1333 líneas, 72 KB)

### Radiografía actual

| Sección | Líneas aprox. | Responsabilidad |
|---|---:|---|
| Helpers de geolocalización | 33–77 | `coordsFromLocation`, `haversineKm`, `getDeliveryETA` |
| Estados (55+ useState) | 80–240 | Multi-step wizard: datos, pago, confirmación |
| Handlers de cupón | 177–216 | validateCoupon |
| Handlers de lealtad | 217–238 | fetchLoyaltyPoints |
| Handlers de teléfono/DNI | 239–475 | validatePhone, handleSelectLocation, useGeo, fetchReferenceSuggestion |
| Handlers de submit | 476–700 | handlePhoneSearch, handleSkipAccount, handleSubmit, handleDataSubmit, handlePaymentSubmit |
| Render: paso "datos" | 700–950 | Formulario de datos del cliente |
| Render: paso "ubicación" | 950–1100 | Selector de ubicación + mapa |
| Render: paso "pago" | 1100–1250 | Selector método pago + Yape |
| Render: paso "confirmación" | 1250–1333 | Resumen + enviar |

### Plan de extracción (5 pasos)

#### Paso 1 — Extraer helpers de geo
Crear `lib/geo-utils.ts`:
- `coordsFromLocation()`
- `haversineKm()`
- `getDeliveryETA()`

**Impacto:** -50 líneas. **Riesgo:** Nulo.

#### Paso 2 — Extraer pasos del wizard como sub-componentes
Crear `components/checkout/` con:
```
checkout/
├── CheckoutModal.tsx               # Orquestador <250 líneas (shell + step machine)
├── steps/
│   ├── StepDatos.tsx               # Formulario de datos del cliente (~200 líneas)
│   ├── StepUbicacion.tsx           # Selector ubicación + mapa (~180 líneas)
│   ├── StepPago.tsx                # Método de pago + Yape (~150 líneas)
│   └── StepConfirmacion.tsx        # Resumen + submit (~120 líneas)
├── hooks/
│   ├── useCheckoutState.ts         # Reducer del wizard (reemplaza 55 useState)
│   ├── useCoupon.ts                # Lógica de cupón
│   ├── useLoyalty.ts               # Puntos + tier
│   ├── useDniLookup.ts             # Validación RENIEC
│   ├── usePhoneSearch.ts           # Búsqueda por teléfono
│   ├── useGeolocation.ts           # Geo + reverse geocode
│   └── useCheckoutSubmit.ts        # Submit final
├── components/
│   ├── DniInput.tsx                # Input con auto-lookup
│   ├── LocationPicker.tsx          # Mapa + suggestions
│   ├── PaymentMethodSelector.tsx   # Yape / Efectivo toggle
│   ├── CouponInput.tsx             # Input + validación visual
│   └── OrderSummary.tsx            # Resumen con cupón, tip, total
└── types.ts                        # Step, PaymentMethod, Customer, Coupon
```

**Impacto:** -1000 líneas en `CheckoutModal.tsx`. **Riesgo:** Alto (CheckoutModal es zona de peligro — pagos, cupones, reservas).

#### Paso 3 — Reemplazar los 55 `useState` con `useReducer`
En `useCheckoutState.ts`:
```typescript
type CheckoutState = {
  step: Step;
  customer: CustomerInfo;
  address: AddressInfo;
  coupon: CouponState;
  payment: PaymentState;
  delivery: DeliveryState;
  ui: UiState;
};
type CheckoutAction = { type: "SET_STEP"; step: Step } | ... ;
function reducer(state: CheckoutState, action: CheckoutAction): CheckoutState { ... }
```

**Impacto:** Un solo `useReducer` reemplaza 55 `useState`. **Riesgo:** Alto — requiere migración cuidadosa y tests.

#### Paso 4 — Tests antes del refactor
Antes de tocar nada, escribir tests que cubran:
- Crear pedido con cupón válido
- Crear pedido con cupón inválido
- Búsqueda por teléfono (encontrado + no encontrado)
- Validación DNI (RENIEC ok, RENIEC falla, usuario skip)
- Geolocalización (permiso ok, permiso denegado, sin GPS)
- Pago Yape con operación + Pago efectivo
- Envío final con deuda + sin deuda

Ubicación: `__tests__/checkout/checkout-modal.test.tsx` y `e2e/checkout.spec.ts`.

**Impacto:** Red de seguridad. **Riesgo:** Nulo. **Sin esto, NO tocar CheckoutModal.**

#### Paso 5 — Validar resultado final
`CheckoutModal.tsx` final esperado:
```tsx
"use client";
import { useCheckoutState } from "./hooks/useCheckoutState";
import { StepDatos, StepUbicacion, StepPago, StepConfirmacion } from "./steps";

export default function CheckoutModal(props: CheckoutModalProps) {
  const { state, dispatch } = useCheckoutState(props);
  return (
    <Modal>
      {state.step === "datos" && <StepDatos state={state} dispatch={dispatch} />}
      {state.step === "ubicacion" && <StepUbicacion state={state} dispatch={dispatch} />}
      {state.step === "pago" && <StepPago state={state} dispatch={dispatch} />}
      {state.step === "confirmacion" && <StepConfirmacion state={state} dispatch={dispatch} />}
    </Modal>
  );
}
```

**Target final:** < 200 líneas en `CheckoutModal.tsx`.

### Criterios de aceptación (CheckoutModal.tsx)

- [ ] `CheckoutModal.tsx` < 250 líneas
- [ ] Cada step < 250 líneas
- [ ] Cada hook < 100 líneas
- [ ] `useReducer` en lugar de los 55 `useState`
- [ ] Tests unitarios por hook (useCoupon, useDniLookup, useGeolocation, usePhoneSearch)
- [ ] Tests e2e: los 8 escenarios listados en Paso 4
- [ ] `npm run test -- checkout` > 20 tests pasando
- [ ] Zero regresiones en bundle size
- [ ] Smoke manual: pedido completo con cupón + Yape + ubicación nueva

---

## Orden de ejecución recomendado

| Orden | Acción | Porque |
|---|---|---|
| 1 | Split archivo 1 — Pasos 1 y 3 (tipos, constantes, NavDefaultTabsConfig) | Bajo riesgo, ganas rápidas, ~400 líneas menos |
| 2 | Split archivo 1 — Paso 2 (extraer OrdersTab completo) | Mayor impacto: -1500 líneas |
| 3 | **Tests de CheckoutModal (Paso 4 del archivo 2)** | Red de seguridad ANTES de tocar pagos |
| 4 | Split archivo 2 — Paso 1 (helpers geo) | Warmup sin riesgo |
| 5 | Split archivo 2 — Paso 2 + 3 (steps + useReducer) | Refactor grande con tests cubriendo |
| 6 | Split archivo 1 — Pasos 4, 5, 6 (hooks, layout, TabRouter) | Con lo más riesgoso de archivo 2 ya cerrado |
| 7 | Validación final completa (test + build + smoke + e2e) | Gate de merge |

## Métricas de éxito

| Métrica | Antes | Target |
|---|---:|---:|
| `app/admin/page.tsx` líneas | 3996 | < 300 |
| `components/CheckoutModal.tsx` líneas | 1333 | < 250 |
| Archivos creados | 0 | ~30 |
| Componentes con > 400 líneas | 2 | 0 |
| `useState` en un solo componente | 60+ | < 10 |
| Tests del checkout | ? | 20+ |
| Bundle size | baseline | -5% a -10% (tree shaking mejor) |

## Zona de peligro — NO tocar sin red de seguridad

Ambos archivos tocan flujos críticos:
- **OrdersTab**: state machine de pedidos, bulk actions, assign driver
- **CheckoutModal**: pagos Yape/efectivo, cupones, reservas de stock, loyalty points

**Regla:** Ningún commit de refactor puede ir a master sin:
1. `npx tsc --noEmit` verde
2. `npm run test` verde
3. `npm run build` verde
4. Smoke manual de los flujos afectados en dev
