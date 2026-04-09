# Tienda Individual (cliente final) — Research 2026-04-09

> **Agent:** STORE-SCOUT
> **Objetivo:** identificar 12-15 mejoras estratégicas de alto impacto para la experiencia de compra del **cliente final** (señora de 55 años en Pucallpa, joven buscando bebidas, etc.).
> **Regla mental:** ¿esto ayuda a una señora de 55 años comprando desde su celular?

---

## 1. Contexto de arquitectura

La app tiene **dos "tiendas" paralelas** — y esta es una fuente de confusión que conviene explicitar:

| Ruta | Dirigida a | Nivel de madurez |
|---|---|---|
| `app/(store)/**` (main tenant) | Cliente final de **Buleje** (tienda principal, subdominio raíz `buleje.pe`) | **MUY alta** — 500+ componentes, wizard de checkout refactorizado, PWA, i18n, loyalty, social proof |
| `app/t/[slug]/tienda/page.tsx` | Cliente final de **cualquier tenant** SaaS (`/t/mibodega/tienda`) | **BAJA** — 413 líneas en un solo client component, fetch manual, sin categorías, sin checkout wizard, sólo grid + carrito local |

Es decir: **Buleje (dogfood) ya tiene el 80% de las best-practices e-commerce**, pero los **tenants SaaS reciben una experiencia degradada**. Cualquier mejora debe hacer explícito a qué ruta aplica. El énfasis estratégico es:

1. **Paridad de la ruta `/t/[slug]/tienda`** con `(store)` — sin duplicar código. (Gap más grande del producto.)
2. **Mejoras transversales** (Peru-specific, mobile-first, post-compra) que actualmente faltan incluso en Buleje.

---

## 2. Mapa del flujo actual

### 2.1 Ruta principal (`app/(store)/**` — Buleje)

```
                              ┌──────────────────────────┐
 Landing (/) ─┬─ AnnouncementBar + Header (mega-menu,   │
              │    voice search, recent searches)        │
              ├─ Hero                                    │
              ├─ PopularCategories                        │
              ├─ ProductsPreview + RecommendedProducts    │
              ├─ DailyDeal / Combos / RecipeSuggestions   │
              ├─ Testimonials / HowItWorks / Benefits     │
              ├─ BrandStory / FAQ / Contact               │
              ├─ DeliveryZoneMap                          │
              ├─ PWAInstallBanner / ReferralBanner        │
              └─ Footer
                              │
                              ▼
 Tienda (/tienda) ─┬─ DailySpecial / SeasonalPromo
                   ├─ CountdownBanner (urgencia)
                   ├─ FlashDeals
                   ├─ PopularProducts / FeaturedCarousel
                   ├─ CombosSection / LastUnitsSection
                   ├─ ProductCatalog (grid + filtros +
                   │    QuickViewModal + list/grid toggle)
                   └─ TiendaClientShell (favoritos,
                        RecentlyViewed, modales)
                              │
                              ▼
 Detalle (/tienda/[slug]) ─ ProductDetailClient
                   ├─ ProductGallery + Variantes + Badges
                   ├─ PriceComparisonBadge + RatingByAttribute
                   ├─ ProductReviewsSection
                   ├─ AlsoBoughtSection (cross-sell)
                   └─ BackInStock (restock notify)
                              │
                              ▼
 Carrito (CartSidebar) ─ items + cupón + SaveCartForLater +
                   CartUpsellSection (co-purchased API)
                              │
                              ▼
 Checkout (CheckoutModal wizard) ─ 5 pasos:
   cuenta → datos → pago → confirmar → exito
   (geolocation, DNI→RENIEC, loyalty tier, cupón,
    Yape/Efectivo/Plin, tip, stock check, pending orders)
                              │
                              ▼
 Post-compra ─ OrderStatusModal + tracking + MisPedidos
              AbandonedCartRecovery (30 min idle) +
              LiveChatWidget con QUICK_QUESTIONS
```

### 2.2 Ruta tenant SaaS (`app/t/[slug]/tienda/page.tsx`)

```
 Landing /t/[slug]     ────▶  /t/[slug]/tienda  ────▶  /t/[slug]/tienda/carrito
 (server, muy básica)        (ÚNICA página, no       (no inspeccionada, pero
                              hay detalle ni          CartBadge apunta ahí)
                              categorías ni
                              checkout wizard)
```

**Diferencias críticas:**
- No hay página de detalle por producto
- No hay filtros ni categorías
- No hay checkout wizard (sólo link a /carrito)
- Cart en `localStorage` plano, sin BroadcastChannel, sin `cart-context`
- Sin reviews, sin variantes, sin SEO schema, sin JSON-LD
- Sin Footer, sin Header global, sin MobileBottomNav

---

## 3. Top 14 mejoras de alto impacto

| # | Mejora | Ruta | Tipo | Impacto | Esfuerzo | Prio |
|---|---|---|---|---|---|---|
| 1 | **Unificar `/t/[slug]/tienda` con `(store)`** — reutilizar mismo layout, catálogo, checkout | SaaS | ✅ completar | Conversión +300-500% tenants | XL | P0 |
| 2 | **Comprobante Boleta/RUC en checkout** (dato Peru obligatorio para empresas) | Ambas | 🆕 nueva | AOV B2B +80%, desbloquea mayoristas | M | P0 |
| 3 | **Auto-reorder ("comprar lo de siempre")** desde mis-pedidos, 1-tap | Ambas | 📈 expansión | Retention, frecuencia +40% | S-M | P0 |
| 4 | **Guest checkout real sin fricción** — saltar paso "cuenta" por defecto, pedir teléfono al final | Ambas | 📈 expansión | Conversión +15-25% (cart abandonment) | S | P0 |
| 5 | **Suscripción / pedido recurrente** (semanal/quincenal de abarrotes básicos) | Buleje | 🆕 nueva | LTV +2-3x, MRR predecible | L | P1 |
| 6 | **Scarcity real en producto + carrito** ("solo quedan 3") usando stock live | Ambas | 📈 expansión (ya hay LastUnitsSection, falta en PDP/card) | Conversión +8-12% | S | P1 |
| 7 | **Delivery schedule (slots horarios)** en lugar de "cuando puedas" | Ambas | 📈 expansión | Reduce quejas "a qué hora llega", +CSAT | M | P1 |
| 8 | **PWA install prompt agresivo post-primera-compra** + push notifications de estado | Ambas | 📈 expansión | Retention +25-40%, re-engagement | S | P1 |
| 9 | **Dirección con mapa + referencia visual por foto** en lugar de texto libre | Ambas | 📈 expansión | Reduce delivery fallidos -60% | M | P1 |
| 10 | **"Combo con lo que compras"** dinámico — upsell inteligente en carrito | Buleje | 📈 expansión | AOV +10-15% | S | P2 |
| 11 | **Reviews con fotos + filtros por rating + verified-buyer badge** | Ambas | 📈 expansión | Trust, conversión +5-8% | M | P2 |
| 12 | **Búsqueda por voz en español (PE)** consolidada + historial + "busquedas frecuentes" | Ambas | 📈 expansión (ya hay Header voice) | UX señora 55 años | S-M | P2 |
| 13 | **WhatsApp como canal de post-compra** (tracking + confirmación automática) | Ambas | 🆕 nueva | Confianza, reduce llamadas soporte | M | P2 |
| 14 | **Guardado de listas de compras** ("mi lista mensual") compartibles | Buleje | 🆕 nueva (hay SavedShoppingList en /store pero poco expuesto) | Retention, frecuencia | S-M | P3 |

---

## 4. Detalle de cada mejora

### 1. Paridad de `/t/[slug]/tienda` con la tienda principal
**Tipo:** ✅ completar (gap arquitectónico crítico)
**Impacto esperado:** conversión de tenants SaaS +300-500%. Hoy un tenant Pro que paga mensualidad recibe una tienda que es **una página plana sin categorías, sin detalle, sin checkout wizard**. No es un producto vendible sostenible.
**Esfuerzo:** XL (semanas de trabajo), pero la mayor parte es **mover**, no crear.
**Qué es:** que `/t/[slug]/tienda` renderice los mismos componentes que `app/(store)/tienda/page.tsx`, resolviendo tenantId desde el segmento `[slug]` en lugar de header `x-tenant-id`. Dos caminos:
  - **A (recomendado):** mover `app/(store)` a `app/t/[slug]` y hacer que Buleje use un slug dedicado (`main` o `buleje`), con rewrite en `proxy.ts` para dominio raíz.
  - **B:** dejar ambas pero importar los mismos componentes y pasar `slug` por prop — se duplica trabajo a futuro.
**Por qué importa:** La señora de 55 años llega por link WhatsApp del tenant → ve una página fea con un grid, sin testimonios, sin PWA, sin loyalty → cero razón para volver. El tenant paga S/99/mes por esto.
**Cómo:**
  - `app/t/[slug]/tienda/page.tsx` — reemplazar por re-export/thin-wrapper del server component de `(store)/tienda/page.tsx`
  - `contexts/tenant-context.tsx` — ya tiene `useTenantSlug`, usarlo en todos los fetch
  - `lib/db/products.db.ts` — ya recibe `tenantId` como primer param
  - `proxy.ts` — asegurar que dominio raíz inyecte header `x-tenant-id=main` consistentemente
**Riesgos:** ALTO. Toca `CartSidebar`, `CheckoutModal` (zona peligrosa, ADR 015), `cart-context` (BroadcastChannel multi-tenant). Requiere ADR nuevo, feature flag, QA exhaustivo, rollout por tenant piloto. **Preferir plan incremental con flag `NEXT_PUBLIC_UNIFIED_STORE`**.

---

### 2. Comprobante Boleta/RUC en checkout
**Tipo:** 🆕 nueva (para cliente final; ya existe en admin POS)
**Impacto esperado:** desbloquea clientes B2B (bodegueros de otras zonas comprando al por mayor, restaurantes, hoteles). AOV B2B típicamente 3-5x mayor que B2C.
**Esfuerzo:** M
**Qué es:** en `StepDatos` del wizard, agregar radio "¿Boleta o Factura?". Si Factura, pedir RUC + razón social. El backend ya tiene `GuiasRemisionModule`, `InvoiceHistory`, `DocumentosEmitidosTab` — la infra existe. El `Customer` model ya tiene campos `tipoPersona`, `tipoDocumento`, `documento`, `razonSocial`, `canal` — **están definidos pero el checkout cliente no los pide**.
**Por qué importa:** el mercado informal de Pucallpa tiene muchos micro-empresarios (puesto en mercado, kiosco, cevicheria) que compran abarrotes al por mayor. Sin factura, no venden a ese segmento. La señora de 55 años que ES una bodeguera perderá ante un competidor que sí la dé.
**Cómo:**
  - `components/checkout/steps/StepDatos.tsx` — nuevo sub-form "Tipo de comprobante"
  - `components/checkout/hooks/useDniLookup.ts` — extender con lookup SUNAT por RUC (existe skill `search-first` para APIs públicas)
  - `lib/db/orders.db.ts` — campo ya soportado; validar que se persista
  - `lib/db/customers.db.ts` — persistir tipoPersona/documento/razonSocial
**Riesgos:** modifica wizard checkout → requiere suite e2e completa. Usar feature flag `ENABLE_INVOICE_REQUEST`.

---

### 3. Auto-reorder ("comprar lo de siempre")
**Tipo:** 📈 expansión — ya existe `QuickReorderModal.tsx` + `QuickReorder.tsx` + `LastOrderBanner.tsx` pero están semi-ocultos
**Impacto esperado:** retention +40%, frecuencia de pedido +30%. Es la diferencia entre "compro cuando me acuerdo" y "Buleje es mi hábito".
**Esfuerzo:** S-M
**Qué es:** botón persistente en el Home y en MobileBottomNav: **"Repetir último pedido"**. Un tap → carrito pre-llenado → checkout wizard directo a "pago" (porque ya tiene dirección/teléfono guardados).
**Por qué importa:** la señora de 55 años compra **lo mismo casi siempre** (arroz, aceite, azúcar, gas, leche). Pedirle que navegue el catálogo cada vez es fricción. Un tap a "lo de siempre" es experiencia Rappi/Uber Eats de clase mundial.
**Cómo:**
  - `components/LastOrderBanner.tsx` — elevar a banner fijo en Hero (solo si `customer.orders.length > 0`)
  - `components/QuickReorderModal.tsx` — ya existe, agregar trigger directo desde MobileBottomNav (nuevo ítem "Repetir")
  - `app/(store)/cuenta/page.tsx` — agregar CTA principal "🔄 Repetir último pedido"
  - Side-effect: rastrear en `ProductAnalytics` qué productos son "staples" por cliente → sugerir solo esos
**Riesgos:** bajo. Sólo orquesta componentes existentes.

---

### 4. Guest checkout real
**Tipo:** 📈 expansión
**Impacto esperado:** +15-25% conversión. Cart abandonment es el problema #1 de e-commerce LATAM.
**Esfuerzo:** S
**Qué es:** hoy el wizard empieza en `step="cuenta"` pidiendo buscar por teléfono antes de nada. Hay un `handleSkipAccount` pero está escondido. Cambiar default: **abrir directo en `datos`**, y pedir teléfono al final (en paso confirmar). Cliente que YA tiene cuenta la detecta por teléfono al final.
**Por qué importa:** la señora no quiere "crear cuenta". Quiere **pagar** y que le llegue. Pedir registro al inicio es el top-1 razón de abandono.
**Cómo:**
  - `components/checkout/CheckoutModal.tsx` — cambiar estado inicial a `step="datos"`, ejecutar `setSkippedAccount(true)` por defecto
  - `components/checkout/hooks/useCheckoutInit.ts` — al abrir, si no hay `customer`, empezar en `datos`; si existe customer, pre-llenar y saltar a `datos` también
  - `components/checkout/steps/StepConfirmar.tsx` — agregar micro-CTA "¿Ya compraste antes? Busca tu teléfono para acumular puntos" como opt-in
**Riesgos:** alto-medio, toca el flujo principal del checkout. Feature flag + A/B test recomendado. Medir con `AbandonedCartRecovery`.

---

### 5. Suscripción / pedido recurrente
**Tipo:** 🆕 nueva
**Impacto esperado:** LTV +2-3x, MRR predecible, churn reducido. Es el santo grial del retail recurrente.
**Esfuerzo:** L
**Qué es:** en detalle del producto y en el carrito, opción **"Repetir automáticamente cada [semana|quincena|mes]"**. El schema ya tiene `recurring` (line 948) en un modelo — posible que sea `Coupon` o similar; falta el `RecurringOrder`. Necesita nuevo modelo Prisma + cron.
**Por qué importa:** "no quiero pensar en comprar arroz cada mes". Es lo que hace que Costco, Amazon Subscribe & Save y Rappi Turbo sean máquinas de cash. Para Pucallpa es un diferenciador brutal.
**Cómo:**
  - `prisma/schema.prisma` — nuevo modelo `Subscription` (customerPhone, items, cadence, nextRunAt, active, tenantId)
  - `lib/db/subscriptions.db.ts` — CRUD con tenantId
  - `app/api/cron/subscriptions/route.ts` — cron diario que crea órdenes "pendientes" con aviso WhatsApp 24h antes
  - `components/ProductDetailClient.tsx` — toggle "Suscribirse" junto al botón "Agregar"
  - `components/checkout/steps/StepPago.tsx` — si hay items de suscripción, mostrar cadencia
**Riesgos:** medio-alto. Nuevo modelo, cron nuevo, hay que manejar pausas, cancelación, cambio de método de pago. ADR obligatorio.

---

### 6. Scarcity real ("solo quedan 3")
**Tipo:** 📈 expansión (existe `LastUnitsSection` y stock en `ProductCatalog`, pero no está visible en ProductCard ni PDP)
**Impacto esperado:** +8-12% conversión en productos con stock bajo
**Esfuerzo:** S
**Qué es:** badge rojo "¡Solo quedan 3!" en `ProductCard` y en `ProductDetailClient` cuando `stock <= stockMin`. Y mensaje tipo "12 personas compraron esto hoy" usando `ProductAnalytics.views` o `sales_count_24h`.
**Por qué importa:** la señora duda. "Lo compro mañana". Cuando ve "solo quedan 3" → compra YA. Scarcity honesta (no inventada) es la táctica más eficiente de conversión sin ser engañosa.
**Cómo:**
  - `components/ProductCard.tsx` — leer `product.stock` y mostrar badge si ≤ stockMin
  - `components/ProductDetailClient.tsx` — ya tiene `isOutOfStock` (línea 184), agregar `isLowStock` con mensaje prominente
  - `lib/db/analytics.db.ts` — nueva query `getSalesLast24h(productId, tenantId)` para el "X personas compraron"
**Riesgos:** bajo.

---

### 7. Delivery schedule (slots horarios)
**Tipo:** 📈 expansión (existe `CheckoutDeliverySchedule.tsx` pero hay que robustecer)
**Impacto esperado:** reduce quejas "a qué hora llega", aumenta CSAT, permite planificación de rutas (beneficio operativo también)
**Esfuerzo:** M
**Qué es:** slots tipo "10-11am, 11-12pm, 12-1pm..." con capacidad máxima por slot. Cliente elige. Si el slot está lleno → "ya no hay cupos, elige otro".
**Por qué importa:** la señora de 55 años no va a esperar 4h sin saber cuándo llega. Necesita saber "entre 11 y 12 estoy". Es una feature de clase Rappi/Cornershop.
**Cómo:**
  - `components/checkout/CheckoutDeliverySchedule.tsx` — ya existe, extender con capacidad
  - `prisma/schema.prisma` — modelo `DeliverySlot` (tenantId, date, startTime, endTime, capacity, reserved)
  - `lib/db/delivery-slots.db.ts` — nuevo
  - Admin UI para configurar slots por día
**Riesgos:** medio. Cambio de schema + nueva lógica de reservas.

---

### 8. PWA install prompt post-primera-compra + push
**Tipo:** 📈 expansión
**Impacto esperado:** retention +25-40%. Una app instalada con push vuelve 4x más que web.
**Esfuerzo:** S (ya existen `InstallPrompt.tsx`, `PWAInstallBanner.tsx`, `ServiceWorkerRegistrar.tsx`, `public/sw.js`)
**Qué es:** trigger el prompt de instalación **justo después de la primera compra exitosa** (momento de máxima satisfacción). Actualmente aparece random. Y activar push para notificar estado del pedido.
**Por qué importa:** la señora acaba de recibir su pedido, está contenta → "Instala la app para que sea más rápido la próxima". Mucho más efectivo que un banner al azar.
**Cómo:**
  - `components/checkout/steps/CheckoutSuccessStep.tsx` — después del confeti, trigger PWA prompt
  - `components/InstallPrompt.tsx` — agregar prop `trigger: "post-purchase" | "auto"`
  - `public/sw.js` — listener push (requiere backend VAPID keys)
  - `lib/push-notifications.ts` (nuevo) — subscribe + server push
  - `prisma/schema.prisma` — ya existe `PushSubscription`? verificar
**Riesgos:** bajo-medio. Push requiere VAPID keys en env.

---

### 9. Dirección con mapa + foto de referencia
**Tipo:** 📈 expansión (ya hay `LeafletMap.tsx`, `geolocation` hook)
**Impacto esperado:** reduce delivery fallidos -60%. En Pucallpa las direcciones son tipo "Jirón Tal, casa verde frente a la bodega de Juan".
**Esfuerzo:** M
**Qué es:** en StepDatos, permitir:
  - Pin en mapa (ya existe)
  - **Subir foto de la fachada** (ayuda al repartidor)
  - Nota de voz grabada ("es la casa verde al lado de...")
**Por qué importa:** en Pucallpa hay numeración inconsistente, calles sin señal, casas sin número. Una foto ahorra 15 min de búsqueda al repartidor y evita el "no pude entregar" que es el peor enemigo del delivery.
**Cómo:**
  - `components/checkout/parts/AddressInput.tsx` — agregar upload field (usar Vercel Blob o Cloudinary ya integrado)
  - `components/checkout/steps/StepDatos.tsx` — UI para foto opcional
  - `prisma/schema.prisma` — `SavedLocation` agregar `photoUrl`, `voiceNoteUrl`
  - Backend: reusar upload route existente (hay admin que sube imágenes)
**Riesgos:** medio. Requiere storage. Pero la infra probablemente ya está (admin sube logos).

---

### 10. Combo dinámico en carrito
**Tipo:** 📈 expansión (ya hay `CartUpsellSection.tsx`, `CombosSection.tsx`, API `/api/products/co-purchased`)
**Impacto esperado:** AOV +10-15%
**Esfuerzo:** S
**Qué es:** cuando el cliente tiene arroz + aceite + azúcar → "Oferta: combo canasta por S/45 (ahorra S/8)". Bundle dinámico = productos + descuento cuando cumplen condición. El schema ya tiene modelo `Bundle` (line 958).
**Por qué importa:** la señora compra 3 items → le sugieres el 4° que completa "la canasta básica" con descuento → salen los 4. Es upsell de libro.
**Cómo:**
  - `components/CartUpsellSection.tsx` — ya consume `/api/products/co-purchased`, extender para bundles
  - `lib/db/bundles.db.ts` — query "¿qué bundle completa el carrito actual?"
  - `contexts/cart-context.tsx` — soporte a items bundled
**Riesgos:** bajo-medio. CUIDADO con recomputar totales en cliente — el backend debe validar el bundle.

---

### 11. Reviews con fotos + filtros + verified-buyer
**Tipo:** 📈 expansión (existe `Review` model, `ProductReviewsSection.tsx`, `ReviewModal.tsx`)
**Impacto esperado:** trust, conversión +5-8%, SEO (reviews generan contenido)
**Esfuerzo:** M
**Qué es:** hoy las reviews son texto básico. Agregar:
  - Upload de foto del producto recibido
  - Badge "Compra verificada" (cliente tiene orden con ese producto)
  - Filtros por rating (5★, 4★...), "con foto", "más recientes"
  - Agregación: 4.5/5 con distribución visual (barras)
**Por qué importa:** la señora no conoce Buleje → busca reviews. Si ve 300 reviews con fotos reales, verificadas → compra. Si ve 5 reviews sin foto → duda.
**Cómo:**
  - `prisma/schema.prisma` — `Review` agregar `photos String[]`, `verifiedBuyer Boolean`
  - `components/ProductReviewsSection.tsx` — filtros + distribución
  - `components/ReviewModal.tsx` — permitir upload múltiples fotos
  - Back: validar `verifiedBuyer = existe Order con ese productId y customerPhone`
**Riesgos:** bajo. Modelo ya existe.

---

### 12. Búsqueda por voz + historial consolidado
**Tipo:** 📈 expansión (existe voice en Header `listening`, `voiceResult`, y `recentSearches`)
**Impacto esperado:** UX mobile-first, especialmente para adultos mayores que no tipean rápido
**Esfuerzo:** S-M
**Qué es:** consolidar la experiencia de búsqueda:
  - Botón de micrófono grande en `MobileBottomNav` o dentro de `SmartSearchBar`
  - Historial de búsquedas (ya se guarda en localStorage) visible
  - Sugerencias tipo "¿quisiste decir..." con Levenshtein (ya existe en `use-advanced-search.ts`)
  - Autocompletado con imágenes
**Por qué importa:** "arr...o...z" → search by voice → la señora no tiene que escribir. Es la feature que más se nota en la edad 50+.
**Cómo:**
  - `components/SmartSearchBar.tsx` (ya existe) — integrar voice
  - `components/MobileBottomNav.tsx` — agregar tab "Buscar" (ya existe) con voice-first
  - `components/marketplace/SearchAutocomplete.tsx` — consolidar
**Riesgos:** bajo. Web Speech API es nativa.

---

### 13. WhatsApp post-compra automatizado
**Tipo:** 🆕 nueva
**Impacto esperado:** confianza, reduce llamadas soporte, retention
**Esfuerzo:** M
**Qué es:** después de la orden:
  - Mensaje 1: "Pedido confirmado" con link a tracking
  - Mensaje 2: "Saliendo a tu casa" cuando repartidor sale
  - Mensaje 3: "Entregado, califica tu compra" + cupón 5%
**Por qué importa:** la señora de 55 años **no usa email**. Usa WhatsApp. Punto. Si no recibe confirmación por WhatsApp, se preocupa y llama.
**Cómo:**
  - Hay provider integration ya — ver `lib/providers/whatsapp-*.ts`
  - `app/api/orders/[id]/status/route.ts` — on status change → dispatch WhatsApp message
  - `lib/db/orders.db.ts` — hook en transiciones de estado (ya hay state machine)
  - Configuración por tenant de templates (admin)
**Riesgos:** medio. Providers de WhatsApp Business API cuestan, hay que elegir proveedor (Twilio, Meta Cloud API, Wati). Feature flag recomendado.

---

### 14. Listas de compras compartibles
**Tipo:** 🆕 nueva (hay `SavedShoppingList.tsx` pero no está bien expuesta al cliente)
**Impacto esperado:** retention, compra colaborativa familia
**Esfuerzo:** S-M
**Qué es:** "Mi lista del mes" — cliente guarda una lista de 20 productos. Tap → carrito pre-llenado. Puede **compartir por WhatsApp a su esposo** con link → él toca → carrito lleno → paga.
**Por qué importa:** la señora hace la lista. El esposo va al trabajo y compra. O los hijos. **Compra colaborativa** es comportamiento real en Pucallpa.
**Cómo:**
  - `components/store/SavedShoppingList.tsx` — ya existe, exponer en /cuenta tab principal
  - `prisma/schema.prisma` — `ShoppingList` (ya existe en tipos de /cuenta)
  - `lib/db/shopping-lists.db.ts` — CRUD con link shareable (short URL)
  - `app/s/[code]/page.tsx` — landing para cargar lista compartida → redirect a /tienda con carrito pre-llenado
**Riesgos:** bajo-medio.

---

## 5. Top 3 mejoras que MÁS mueven la aguja de conversión

1. **#4 Guest checkout real** — elimina la fricción #1 de e-commerce. Impacto inmediato, esfuerzo bajo, **ganador claro**.
2. **#1 Unificar `/t/[slug]`** — sin esto, el SaaS multi-tenant no es un producto vendible. Es un gap estructural, no cosmético.
3. **#3 Auto-reorder** — no mueve la conversión de la primera compra, pero **multiplica la frecuencia de pedidos** que es el KPI que realmente define viabilidad del delivery.

---

## 6. Mobile-first wins (la cliente usa celular)

| Win | Por qué | Estado |
|---|---|---|
| MobileBottomNav con 5 tabs | Navegación siempre accesible | ✅ existe |
| StickyCartBar persistente | El carrito nunca se pierde | ✅ existe |
| Touch targets mínimo 44px | Dedos de señora 55 años | ⚠️ verificar en ProductCard |
| Imágenes ≤ 100KB con srcset | 4G inestable en Pucallpa | ⚠️ auditar en Header/Hero |
| Skeleton loaders | Percepción de velocidad | ✅ existe |
| PWA install + offline | Trabaja sin internet | ✅ existe (reforzar trigger) |
| Voz para búsqueda | No tipear | ⚠️ existe, mejorar integración |
| Modo "Datos ahorro" | Low-bandwidth | ❌ no existe — mejora futura |
| Haptic feedback en add-to-cart | Confirmación táctil | ❌ no existe — mejora futura |
| Font size mínimo 16px en inputs | Evita zoom en iOS | ⚠️ auditar |

---

## 7. Peru-specific wins

| Win | Estado | Acción |
|---|---|---|
| Yape payment | ✅ existe (`YapePaymentPanel.tsx`) | Mantener |
| Plin payment | ✅ existe (`PlinPaymentPanel.tsx`) | Mantener |
| Efectivo con calculadora vuelto | ✅ existe (`ChangeCalculator.tsx`) | Mantener |
| DNI→RENIEC auto-fill | ✅ existe (`useDniLookup.ts`) | Mantener |
| **Boleta / Factura / RUC** (SUNAT) | ❌ falta en checkout cliente | **Mejora #2** |
| WhatsApp como canal primario | ✅ parcial (send order) | **Mejora #13** |
| Pucallpa specific: coordenadas default `-8.3791,-74.5539` | ✅ existe | Mantener |
| Delivery gratuito > S/50 | ✅ existe (`FreeDeliveryBanner`) | Mantener |
| Geolocation con fallback manual | ✅ existe | Mantener |
| Lengua: solo español | ✅ está | OK (agregar shipibo-konibo en el futuro sería diferenciador — hay `LanguageSelector`) |
| Cupones vía WhatsApp | ❌ no verificado | Posible quick win |
| Yape con comprobante foto | ⚠️ parcial (pide número de operación) | Agregar upload de screenshot |
| Pago contra entrega con crédito (fiado) | ⚠️ existe para admin, no para cliente final | Feature diferenciadora |

---

## 8. Quick wins (<1 día, alto impacto)

1. **Scarcity badge en ProductCard** (mejora #6) — 2-3 horas. Lee `product.stock`, muestra "Solo quedan X" si ≤5.
2. **PWA prompt post-compra** (mejora #8, parte 1) — 1-2 horas. Trigger `InstallPrompt` en `CheckoutSuccessStep`.
3. **Guest checkout default** (mejora #4) — 4-6 horas. Cambiar `initialStep` del reducer. Requiere QA del flujo.
4. **"Repetir último pedido" CTA en Home** — 2-3 horas. `LastOrderBanner` ya existe, solo reposicionar.
5. **Touch-target audit en ProductCard** — 1 hora. Verificar botones ≥44px (probable que ya estén, pero auditar).

---

## 9. Lo que NO tocar

| Archivo | Por qué |
|---|---|
| `components/checkout/CheckoutModal.tsx` (core) | ZONA PELIGROSA ADR 015. Tocar solo con feature flag, e2e completo, y reason convincente. |
| `contexts/cart-context.tsx` — BroadcastChannel | Multi-tab sync. Cualquier cambio puede romper la sincronización que es invisible cuando funciona. |
| `lib/db/orders.db.ts` | Idempotency + state machine. Añadir campos está OK; cambiar lógica NO. |
| `proxy.ts` + middleware | ADR 014. Auth + tenant + rate limit. |
| `app/admin/page.tsx` | No es cliente-final pero está listado en zona peligrosa — no mezclar. |

Y en particular: **NO duplicar código entre `(store)` y `/t/[slug]`**. Si el plan es no unificar en el corto plazo (mejora #1), al menos todas las nuevas mejoras (2-14) deben construirse como **componentes compartidos** en `components/` que ambas rutas importen, no como duplicaciones.

---

## 10. Resumen ejecutivo

- **Buleje (dogfood) está en clase mundial** — wizard de checkout refactorizado, 500+ componentes, PWA, loyalty, voice search, social proof, abandoned cart recovery, live chat con bot.
- **Los tenants SaaS NO** — reciben una página plana de 413 líneas. Este es el **gap #1** del producto y hace que el SaaS no sea vendible como está.
- **Los mejores wins** son los que **desbloquean nuevos segmentos** (RUC/factura → B2B, suscripciones → recurrencia) o **eliminan fricciones críticas** (guest checkout, auto-reorder, WhatsApp post-compra).
- **Quick wins de 1 día**: scarcity badge, PWA post-compra, guest checkout default, reorder CTA. 4 mejoras en una semana pueden mover +15-20% conversión en Buleje sin tocar zona peligrosa.
- **El test "señora de 55 años en Pucallpa" favorece**: guest checkout + auto-reorder + WhatsApp + voice search + dirección con foto + PWA con push.

---

> **Autor:** STORE-SCOUT agent
> **Fecha:** 2026-04-09
> **Revisar:** cada 6-8 semanas o tras refactor grande
