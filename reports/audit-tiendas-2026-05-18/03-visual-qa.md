# Visual QA — flujo /tiendas → checkout
**Fecha:** 2026-05-18 | **Branch:** feat/checkout-payment-proof | **Auditor:** Storefront Visual QA Agent

## Resumen (3 líneas)
Se auditaron 6 rutas en 4 combinaciones (mobile 390×844 + desktop 1440×900, light + dark). Se detectaron **22 hallazgos**: 5 bloqueantes, 11 mejoras, 6 polish. La peor ruta es `/marketplace/[slug]` (storefront individual): el tour de bienvenida bloquea toda la UI al primer acceso sin localStorage correcto, hay un emoji 🔥 hardcodeado en código, cards de producto sin `hover:-translate-y-0.5` en mobile, y `StoreDetailClient` usa `bg-white dark:bg-gray-950` (token raw, no DS).

---

## Hallazgos por ruta

### /tiendas (listado público)

**Screenshots:** `tiendas_mobile_light_top.png`, `tiendas_mobile_light_mid.png`, `tiendas_mobile_dark_top.png`, `tiendas_desktop_light.png`, `tiendas_desktop_dark.png`

| # | Severidad | Breakpoint | Issue | Ubicación en código |
|---|---|---|---|---|
| T-1 | 🟡 Mejora | Mobile light/dark | Filtro "ORDENAR" cortado — el chip sale del viewport sin ellipsis ni scroll snap, el texto se ve truncado | `TiendasClient.tsx` L1374–1388, chips con `text-sm font-bold` sin `min-w-0` |
| T-2 | 🟡 Mejora | Mobile light | Subcategorías usa chips con emoji de imagen (pollo, pizza) — imágenes decorativas sin `aria-hidden` explícito | `TiendasClient.tsx` zona subcategories, componente subcategory chips |
| T-3 | 🟢 Polish | Mobile dark | Dark mode tiendas correcto — tokens `--color-card/foreground` funcionan. Sin issue de contraste visible | — |
| T-4 | 🟢 Polish | Desktop light/dark | Stats hero (6 tiendas, 2 zonas, Perú) legibles. Tipografía correcta `text-base`+ | `TiendasClient.tsx` hero section |
| T-5 | 🟡 Mejora | Mobile | "Ver todos" y "RECOMENDACIONES" label usa `text-xs` (`--ts-2xs`) — por debajo del mínimo `text-base` para body. Es un label secundario pero en mobile resulta diminuto | `TiendasClient.tsx` L839 `text-xs font-bold` y L873 `text-xs text-[var(--text-tertiary)]` |
| T-6 | 🟡 Mejora | Mobile | Cards de tienda en lista usan `border border-[var(--rule-soft)]` (1px) — debería ser `border-2` conforme a bsm-typography-rules para elementos interactivos | `TiendasClient.tsx` L849, L1265 `border border-[var(--rule-base)]` |

---

### /marketplace (hub cross-store)

**Screenshots:** `marketplace_mobile_light_top.png`, `marketplace_mobile_light_mid.png`, `marketplace_desktop_light.png`

| # | Severidad | Breakpoint | Issue | Ubicación en código |
|---|---|---|---|---|
| M-1 | 🔴 Bloqueante | Mobile | Tour "Paso 1 de 3 — Buscá lo que necesitás" aparece encima del hero completo en el primer acceso. Bloquea el 80% del viewport sin poder agregar al carrito. La key localStorage es `"buleje-tour-marketplace-2026-04"` — si no está seteada, el tour bloquea. Debería no bloquear el contenido principal | `MarketplaceFirstVisitTour.tsx` L14, `GuidedTour` sin `z-index` condicional |
| M-2 | 🟡 Mejora | Mobile | Cupón "10% OFF" — banner superpuesto aparece encima de las tiendas featured sin opción de cerrar visible en el viewport capturado. El botón X está fuera del área visible | `MarketplaceWelcomeCoupon.tsx` o similar |
| M-3 | 🟢 Polish | Desktop light | Stats en hero (6 tiendas, 4.8, Perú) con tipografía correcta. "Bodegas que no puedes perderte" en `text-2xl`+ | — |
| M-4 | 🟡 Mejora | Mobile mid | Sección "Más vendidos" tiene badges `ESTA SEMANA` en color accent verde sobre fondo blanco — contraste AA correcto. Sin embargo los números skeleton (1, 2) en productos vacíos son muy tenues, podrían confundirse con contenido real | `marketplace/page.tsx` sección trending |

---

### /marketplace/[slug] — Buleje (main) y Pizza Pucallpa

**Screenshots:** `storefront_main_mobile_light_top.png`, `storefront_main_mobile_light_products.png`, `storefront_main_mobile_notour.png`, `storefront_main_mobile_products_notour.png`, `storefront_main_mobile_cats.png`, `storefront_main_mobile_dark_notour.png`, `storefront_main_desktop_light.png`, `storefront_main_desktop_light_products.png`, `storefront_main_desktop_dark.png`, `storefront_pizza_mobile_light_top.png`, `storefront_pizza_mobile_light_products.png`

| # | Severidad | Breakpoint | Issue | Ubicación en código |
|---|---|---|---|---|
| S-1 | 🔴 Bloqueante | Mobile + Desktop | Tour "Paso 1 de 3" bloquea toda la UI del storefront en primer acceso. El contenido de fondo queda inaccesible. Es el mismo tour que en /marketplace pero ocurre de nuevo en cada slug individual. En pizza-pucallpa el tour cubre el catálogo completo en mobile | `MarketplaceFirstVisitTour.tsx` — se monta en StoreDetailClient sin guardar estado por slug |
| S-2 | 🔴 Bloqueante | Mobile | Emoji 🔥 hardcodeado en `"🔥 Los más pedidos"` — viola regla blindada `feedback_no_generic_emojis`. Debería ser `<Flame className="h-4 w-4" />` de Lucide | `StoreCatalog.tsx` L391 |
| S-3 | 🔴 Bloqueante | Mobile + Desktop | `StoreDetailClient.tsx` L207: `bg-white dark:bg-gray-950` — token raw Tailwind, no DS. En dark mode el fondo es `gray-950` en lugar de `var(--color-card)` o `var(--surface-canvas)`. Esto rompe el theming si se personaliza el dark brand del tenant | `StoreDetailClient.tsx` L207 |
| S-4 | 🟡 Mejora | Mobile | Cards de producto en StoreCatalog usan `border border-[var(--rule-soft)]` (1px) sin `border-2`. Regla bsm-typography-rules: elementos interactivos deben tener `border-2` | `StoreCatalog.tsx` L103 `rounded-xl border border-[var(--rule-soft)]` |
| S-5 | 🟡 Mejora | Mobile | Imágenes de producto con placeholder "Sin foto" — se muestran el icono de carrito teal sin texto alt descriptivo en el `<img>`. En pizza-pucallpa varios productos sin foto tienen solo el icono del carrito como texto visual | `StoreCatalog.tsx` producto sin imagen |
| S-6 | 🟡 Mejora | Mobile | Badge de count de categoría (`Bebidas 8`, `Frutas y Verduras 7`) usa clase `text-xs` en el contador — el número es ilegible en mobile a font-size < 12px efectivo | `StoreCategories.tsx` L164 `h-6 px-2 text-xs font-black` |
| S-7 | 🟡 Mejora | Mobile dark | Dark mode storefront: la navbar secundaria (`Buleje`, flechas atrás/info) tiene fondo gris oscuro genérico, no usa `var(--surface-raised)`. Texto blanco sobre gris oscuro — contraste OK pero inconsistente con design system | `StoreDetailClient.tsx` navbar section |
| S-8 | 🟡 Mejora | Desktop | Tour bloquea el área del catálogo completo en desktop también. La búsqueda interna "Buscar en Buleje..." con select "Relevancia" quedan detrás del overlay | `MarketplaceFirstVisitTour.tsx` |
| S-9 | 🟢 Polish | Mobile | "AcompañAmientos" — capitalización incorrecta (camelCase visual). Debería ser "Acompañamientos" | `StoreCatalog.tsx` — `humanizeCategory()` function no normaliza correctamente |
| S-10 | 🟢 Polish | Desktop dark | Background del storefront en dark: `bg-gray-950` en lugar de token DS. Diferencia sutil pero acumula deuda de tokens | `StoreDetailClient.tsx` L207 |
| S-11 | 🟢 Polish | Desktop | Botón "Ver catálogo" en hero tienda (desktop) correcto — `h-12 rounded-xl` y contraste AA. Sin issues | — |
| S-12 | 🟢 Polish | Mobile | Selector "Relevancia" es un `<select>` nativo — funcional pero inconsistente con el design system. No usa el componente StoresSortSelector custom | `StoreCatalog.tsx` zona sort |

---

### /checkout (carrito + pasarela)

**Screenshots:** `checkout_mobile_light.png`, `checkout_mobile_dark.png`, `checkout_desktop_light.png`, `checkout_desktop_light_stepbar.png`

| # | Severidad | Breakpoint | Issue | Ubicación en código |
|---|---|---|---|---|
| C-1 | 🟡 Mejora | Mobile + Desktop | Estado vacío "Tu carrito está vacío" — correcto visualmente: ilustración, CTA teal `h-12`, texto `text-base`+. Dark mode: bien. Sin issues críticos. La ilustración (pez Paiche) es SVG custom — cumple regla no-emoji | `checkout/page.tsx` o `CartEmptyState` |
| C-2 | 🟡 Mejora | Mobile dark | Tour "Buscá lo que necesitás" aparece solapado sobre el carrito vacío en dark mode — el overlay del tour tiene fondo blanco con texto negro, que en dark mode rompe la coherencia visual (fondo claro flotando sobre UI oscura). Falta `dark:bg-[var(--surface-raised)]` en el modal del tour | `GuidedTour` component — no tiene variante dark |
| C-3 | 🟡 Mejora | — | `YapePaymentPanel.tsx`: contenedor principal usa `border border-purple-200` (1px, raw Tailwind) — debería ser `border-2 border-purple-200`. Además `bg-red-50 border border-red-200` en el estado expirado sin tokens DS | `YapePaymentPanel.tsx` L42, L53 |
| C-4 | 🟡 Mejora | — | `YapePaymentPanel.tsx`: instrucciones de pago usan `text-xs text-gray-600` — `text-xs` viola bsm-typography-rules para body (mínimo `text-base`/`text-sm` con `font-semibold`). `gray-600` es token raw sin `dark:` pair | `YapePaymentPanel.tsx` L69, L73, L77 |
| C-5 | 🟡 Mejora | — | `YapePaymentPanel.tsx`: input número de operación usa `rounded-xl` (no `rounded-2xl`) y `py-3` en lugar de altura fija `h-12`. Border es `border-2` — correcto, pero el radius es inconsistente con el resto del checkout | `YapePaymentPanel.tsx` L148 |
| C-6 | 🟢 Polish | — | `PaymentProofModal.tsx` (zona nueva): el modal está bien construido — `border-2`, `h-12` en CTAs, tokens DS (`var(--surface-raised)`, `var(--rule-soft)`), `role="dialog" aria-modal`. El upload drag-zone usa `border-2 border-dashed` — correcto. Sin issues críticos. El badge "Subida" usa `text-xs` pero es un indicador de estado (contexto decorativo, no body) — borderline aceptable |

---

### /marketplace/como-pagar (referencia flujo Yape)

**Screenshots:** `como_pagar_mobile_light.png`, `como_pagar_mobile_light_mid.png`

| # | Severidad | Breakpoint | Issue | Ubicación |
|---|---|---|---|---|
| CP-1 | 🔴 Bloqueante | Mobile | Tour nuevamente bloquea esta página también — patrón sistémico: el tour aparece en todas las rutas `/marketplace/*` para usuarios sin localStorage correcto | `MarketplaceFirstVisitTour.tsx` — montado globalmente en el layout |
| CP-2 | 🟢 Polish | Mobile | QR de Yape se muestra correctamente. Los stats (87% pedidos Yape, <30s confirmación) legibles. Sin issues de contraste | — |

---

## Top-10 fixes priorizados

| Prioridad | Componente | Issue | Fix sugerido |
|---|---|---|---|
| 1 🔴 | `MarketplaceFirstVisitTour.tsx` | Tour bloquea UI en TODAS las rutas marketplace — sistémico. Impacta /marketplace, /marketplace/[slug], /marketplace/como-pagar. Cada cliente nuevo queda bloqueado | Agregar `pointer-events-none` al overlay, o mostrar el tour en un bottom-sheet no bloqueante. Alternativamente: setear la key `"buleje-tour-marketplace-2026-04"` en `localStorage` desde el middleware de onboarding para usuarios ya registrados |
| 2 🔴 | `StoreCatalog.tsx` L391 | `"🔥 Los más pedidos"` — emoji hardcodeado, viola regla blindada | Reemplazar: `<Flame className="h-4 w-4 text-orange-500" strokeWidth={2} />` + texto `"Los más pedidos"` |
| 3 🔴 | `StoreDetailClient.tsx` L207 | `bg-white dark:bg-gray-950` — tokens raw Tailwind, no DS | Cambiar a `bg-[var(--surface-canvas)]` — el dark mode lo resuelve automáticamente vía CSS variables |
| 4 🟡 | `YapePaymentPanel.tsx` L69–77 | Instrucciones de pago en `text-xs text-gray-600` — texto del paso 1/2/3 ilegible en mobile, sin par `dark:` | Cambiar a `text-sm text-[var(--text-secondary)]`. En mobile la instrucción de pago es texto crítico — debe ser `text-sm` mínimo |
| 5 🟡 | `YapePaymentPanel.tsx` L42 | `border border-purple-200` (1px) en el contenedor principal de Yape | Cambiar a `border-2 border-purple-200` — consistencia bsm-typography-rules |
| 6 🟡 | `StoreCatalog.tsx` L103 | Cards de producto: `border border-[var(--rule-soft)]` (1px), sin `hover:-translate-y-0.5` en mobile | Cambiar a `border-2` + agregar `hover:-translate-y-0.5 transition-transform` al wrapper del card |
| 7 🟡 | `TiendasClient.tsx` L849, L873 | Cards de tienda con `border border-[var(--rule-soft)]` (1px) + labels `text-xs` en zona, nombre secundario | `border-2` en cards. Labels de descripción: `text-sm` mínimo |
| 8 🟡 | `GuidedTour` (componente base) | Modal del tour tiene fondo blanco sin variante dark — en dark mode flota como parche claro sobre UI oscura | Agregar `dark:bg-[var(--surface-raised)] dark:text-[var(--text-primary)]` al contenedor del modal del tour |
| 9 🟡 | `StoreCatalog.tsx` `humanizeCategory()` | "AcompañAmientos" — capitalización incorrecta, camelCase visual llega al cliente | Fix: `humanizeCategory` debe aplicar `.toLowerCase()` antes del `.charAt(0).toUpperCase()` o normalizar el string de DB |
| 10 🟢 | `StoreDetailClient.tsx` L661, L672 | `border border-gray-200 dark:border-gray-800`, `bg-white dark:bg-gray-800` — raw Tailwind en sección de estado vacío de variantes | Migrar a `border-2 border-[var(--rule-base)]`, `bg-[var(--surface-raised)]` |

---

## Screenshots index

| Archivo | Ruta | Breakpoint | Tema |
|---|---|---|---|
| `tiendas_mobile_light_top.png` | /tiendas | Mobile 390×844 | Light |
| `tiendas_mobile_light_mid.png` | /tiendas (scroll) | Mobile 390×844 | Light |
| `tiendas_mobile_dark_top.png` | /tiendas | Mobile 390×844 | Dark |
| `tiendas_desktop_light.png` | /tiendas | Desktop 1440×900 | Light |
| `tiendas_desktop_dark.png` | /tiendas | Desktop 1440×900 | Dark |
| `marketplace_mobile_light_top.png` | /marketplace | Mobile 390×844 | Light |
| `marketplace_mobile_light_mid.png` | /marketplace (scroll) | Mobile 390×844 | Light |
| `marketplace_desktop_light.png` | /marketplace | Desktop 1440×900 | Light |
| `storefront_main_mobile_light_top.png` | /marketplace/main (con tour) | Mobile 390×844 | Light |
| `storefront_main_mobile_light_products.png` | /marketplace/main productos (con tour) | Mobile 390×844 | Light |
| `storefront_main_mobile_notour.png` | /marketplace/main (sin tour) | Mobile 390×844 | Light |
| `storefront_main_mobile_products_notour.png` | /marketplace/main productos (sin tour) | Mobile 390×844 | Light |
| `storefront_main_mobile_cats.png` | /marketplace/main categorías | Mobile 390×844 | Light |
| `storefront_main_mobile_dark_notour.png` | /marketplace/main (sin tour) | Mobile 390×844 | Dark |
| `storefront_main_desktop_light.png` | /marketplace/main | Desktop 1440×900 | Light |
| `storefront_main_desktop_light_products.png` | /marketplace/main (scroll) | Desktop 1440×900 | Light |
| `storefront_main_desktop_dark.png` | /marketplace/main | Desktop 1440×900 | Dark |
| `storefront_pizza_mobile_light_top.png` | /marketplace/pizza-pucallpa (con tour) | Mobile 390×844 | Light |
| `storefront_pizza_mobile_light_products.png` | /marketplace/pizza-pucallpa productos | Mobile 390×844 | Light |
| `storefront_add_to_cart.png` | /marketplace/main agregar item | Mobile 390×844 | Light |
| `checkout_mobile_light.png` | /checkout (carrito vacío) | Mobile 390×844 | Light |
| `checkout_mobile_dark.png` | /checkout (carrito vacío) | Mobile 390×844 | Dark |
| `checkout_desktop_light.png` | /checkout (carrito vacío) | Desktop 1440×900 | Light |
| `checkout_desktop_light_stepbar.png` | /checkout stepbar | Desktop 1440×900 | Light |
| `como_pagar_mobile_light.png` | /marketplace/como-pagar | Mobile 390×844 | Light |
| `como_pagar_mobile_light_mid.png` | /marketplace/como-pagar (scroll, QR) | Mobile 390×844 | Light |

---

## Notas metodológicas
- `PaymentProofModal` (zona nueva branch feat/checkout-payment-proof) no pudo activarse desde UI sin sesión autenticada. El análisis se realizó por lectura directa del código fuente: el modal está correctamente construido con tokens DS, `border-2`, `h-12` en CTAs, `role="dialog"`, y `capture="environment"` para cámara nativa. El único issue es el badge "Subida" con `text-xs` (borderline, contexto decorativo).
- El tour `GuidedTour` se repite en TODAS las rutas del marketplace layout. Este patrón es el hallazgo más crítico del flujo.
- Análisis estático adicional: `grep` sobre `text-xs`, `border border`, `bg-gray-*`, `hover:-translate`, emojis — confirmados contra screenshots.
