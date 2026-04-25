# Marketplace Buleje — Blueprint de mejoras de alto impacto

**Generado:** 2026-04-25
**Estado del marketplace:** 244 componentes TSX · 34 páginas · 89 endpoints API · 25 sub-rutas funcionales
**Objetivo:** elevar diseño, estructura, navegación, conversión y velocidad — listo para ejecución paralela con agent teams

> Cada item tiene **ID** estable (MK-XX) para referenciarlo en commits, ADRs y handoffs entre agentes.
> **Esfuerzo**: XS=<2h · S=½día · M=1-2 días · L=3-5 días · XL=1+ semana
> **Owner**: agente recomendado del catálogo (`frontend`, `backend`, `database`, `integrator`, `tester`, `marketplace-specialist`, `seo-growth-strategist`, `performance-engineer`).

---

## Índice de Workstreams

| WS | Tema | # items | Owner líder | Puede correr en paralelo con |
|---|---|---|---|---|
| **WS1** | Discovery & Search | 9 | marketplace-specialist + frontend | WS2, WS5, WS7 |
| **WS2** | Catálogo & PDP | 9 | frontend + backend | WS1, WS4, WS8 |
| **WS3** | Cart & Checkout | 8 | checkout-specialist + backend | WS4 (parcial), WS6 |
| **WS4** | Cuenta, Loyalty & Retención | 8 | frontend + backend | WS1, WS3, WS5 |
| **WS5** | Content & Engagement | 7 | marketplace-specialist + ai-ml-engineer | WS1, WS2, WS8 |
| **WS6** | Performance & Tech | 8 | performance-engineer + database | TODOS (cross-cutting) |
| **WS7** | Mobile, Tablet & A11y | 6 | frontend + tester | TODOS |
| **WS8** | Trust, Social Proof & Conversión | 7 | marketplace-specialist + seo | WS1, WS2, WS5 |

**Total: 62 mejoras** distribuidas en **8 workstreams paralelos**.

---

## WS1 — Discovery & Search

> Foco: cómo el usuario llega al producto correcto en el menor tiempo. Home, búsqueda, autocomplete, filtros.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-01** | **Hero personalizado por hora del día**: "Buenos días, ¿desayuno rápido?" / "Mediodía, ¿almuerzo a domicilio?" / "Cena ligera". Sustituye el hero genérico actual. CTA contextual (categorías top de la franja horaria) | Sube CTR del hero ~30% (probado en delivery apps). Conecta emocionalmente | M | frontend | data-analyst para stats de horas |
| **MK-02** | **Búsqueda con autocompletado predictivo** (`/api/marketplace/autocomplete` ya existe — falta UI rica). Mostrar productos + tiendas + categorías + recetas en dropdown agrupado, con thumbnails | Reduce abandono de búsqueda. Usuarios que ven thumbnail click 2.5× más | M | frontend | backend para optimizar query (<200ms) |
| **MK-03** | **Filtros pegajosos (sticky) en `/buscar` y `/categoria`** mientras scroleas. Hoy se pierden al bajar — el usuario tiene que volver arriba | Sube uso de filtros 60%. Crítico en mobile | S | frontend | — |
| **MK-04** | **Búsqueda por voz** (Web Speech API en mobile). Especialmente útil en motos/conduciendo | Diferenciador único en Pucallpa. Conecta con público no-tech | M | frontend | tester para test cross-browser |
| **MK-05** | **Historial de búsquedas + búsquedas trending de la zona** en empty state del search | Reactivación de usuarios. "Otros en Pucallpa buscaron..." | S | frontend | backend para aggregator |
| **MK-06** | **Filtro "Cerca de mí"** con geolocalización browser. Hoy hay `?zona=` pero requiere typing | -3 clicks promedio. Sube engagement mobile | M | frontend | integrator (Google Places fallback) |
| **MK-07** | **Resultados con badge "Llega en X min"** según distancia + horario de delivery del store. Hoy solo se ve después de entrar al store | Sube CTR de cards 18-25% | M | frontend + backend | base de delivery zones (DB) |
| **MK-08** | **CategoryMegaMenu rediseñado con columnas + iconos**: hoy es plano. Estructurar 4 columnas (Frescos / Almacén / Bebidas / No-comida) con sub-categorías + thumbnails de productos top | UX pro de Mercado Libre / Amazon. Reduce profundidad de clicks | M | frontend | — |
| **MK-09** | **"No encontré lo que busco" → CTA WhatsApp directo a admin** con la búsqueda pre-cargada. Captura demanda perdida | Convierte 5-12% de empty states en pedidos manuales | XS | frontend | integrator (WhatsApp) |

---

## WS2 — Catálogo & PDP (Product Detail Page)

> Foco: pages de productos individuales y cómo se navega el catálogo de cada store.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-10** | **Galería de imágenes con zoom + swipe + thumbnails**. Hoy muchas PDP solo tienen 1 foto | E-commerce profesional requiere galería. Sube conversión 15-25% | M | frontend | tooling para batch upload de imágenes |
| **MK-11** | **Variants visuales** (sabor, presentación, tamaño) como pills/swatches, no como dropdown. Hoy se ve como `<select>` | Sube conversión en categorías con variants (snacks, bebidas, helados) | M | frontend + backend | schema variants en DB |
| **MK-12** | **"Stock disponible" en tiempo real** con badge: "Quedan 3" en rojo si <5. Crear sentido de urgencia genuino | Sube conversión 8-15% sin tácticas falsas | S | frontend | backend (real-time stock) |
| **MK-13** | **Comparar productos sticky** mientras navegas. Hoy `/comparar` existe pero el flow para agregar es confuso | -50% clicks para comparar | S | frontend | — |
| **MK-14** | **PDP cross-sell smart**: "Otros que compraron X también llevaron Y" con productos de **otras tiendas** (multi-store). Ya existe `recommendations/for-me` — extender | Aumenta ticket promedio 12-20%. Único valor del marketplace multi-vendor | L | ai-ml-engineer + backend | data de co-occurrence purchases |
| **MK-15** | **Recetas-as-PDP**: en cada producto, sección "Recetas con este ingrediente" linkeando a `/recetas/[id]`. Convierte producto en historia | Engagement único. SEO long-tail | M | frontend + ai-ml-engineer | catálogo recetas existente |
| **MK-16** | **Comparativa de precios entre tiendas** automática en cada PDP: "Este producto en otras 3 tiendas: S/X, S/Y, S/Z" con CTA "Ver en otra tienda" | Diferenciador único marketplace. Transparencia = confianza | M | backend + frontend | API endpoint nuevo |
| **MK-17** | **Catalog infinite scroll con virtualization** (react-window). Hoy `CatalogInfiniteScroll` no virtualiza — DOM crece sin límite con scroll largo | Performance: 1000+ productos sin lag | M | performance-engineer | — |
| **MK-18** | **Quick view modal** desde card sin abandonar listado. Tap en thumb → modal con info + add-to-cart sin perder scroll position | Sube interacción 25%. UX e-commerce moderna | M | frontend | — |

---

## WS3 — Cart & Checkout

> Foco: flujo de carrito multi-store y pago. Crítico — cada bug aquí = pedido perdido.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-19** | **Cart drawer rediseñado**: hoy `AddedToCartDrawer` aparece y se cierra. Convertir en panel persistente con productos por tienda + subtotales por tienda + sticky checkout button | Reduce abandono de carrito 20-30% | M | checkout-specialist + frontend | — |
| **MK-20** | **"Falta poco para envío gratis"**: barra de progreso "S/X / S/Y para envío gratis" cuando hay umbral por tienda | Sube ticket promedio 18% (probado universalmente) | S | frontend + backend | config envío gratis por store |
| **MK-21** | **Estimación de delivery total** en el carrito antes del checkout: "Llega entre 25-40 min" basado en distancia + horario | Reduce sticker shock en checkout. Aumenta conversión | M | backend + frontend | API delivery zones |
| **MK-22** | **Save-for-later por ítem** en carrito (heart icon). Hoy solo borrar | Recupera 8-15% de items casi-eliminados | S | frontend + backend | endpoint /api/marketplace/cart/save-later |
| **MK-23** | **Checkout one-page** opcional para usuarios recurrentes: dirección + pago + confirmar en una vista. Hoy stepper 4 pasos | -30% tiempo checkout para repeat customers | M | checkout-specialist | account picker existente |
| **MK-24** | **Guest checkout** (sin registro forzado). Hoy obliga login antes de checkout | Sube conversión guest 25-40%. Después se invita a crear cuenta tras pagar | L | backend + checkout-specialist | refactor auth gate |
| **MK-25** | **Resumen multi-tienda visual** en checkout: cada store con su sub-total + delivery por separado, no un total grande. Transparencia | Reduce bounces en checkout. "¿Por qué tan caro?" se previene | S | frontend | — |
| **MK-26** | **Confirmación post-pago con estimado live + share to WhatsApp + "agregar a calendario"** para los más planificados | Engagement post-conversión. Reactivación | S | frontend + integrator | — |

---

## WS4 — Cuenta, Loyalty & Retención

> Foco: usuarios autenticados, pedidos pasados, fidelización.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-27** | **Mi-cuenta home rediseñado** como dashboard: saldo de cupones, pedidos en curso, estado del último pedido, recomendaciones para vos | Aumenta retorno mensual 15-25% | M | frontend | — |
| **MK-28** | **Re-pedir** desde historial — un click clona pedido pasado al carrito. Hoy hay que reabrir y agregar uno por uno | Conversión re-orden 3-5× | S | frontend + backend | endpoint reorder |
| **MK-29** | **Tracking de pedido en vivo** con mapa (`ActiveDeliveryWidget` ya existe — extender a página propia con SSE) | Reduce llamadas "¿dónde está mi pedido?" | M | backend + integrator | webhook driver location |
| **MK-30** | **Reseñas con foto + likes** (hoy hay reviews simples). Marketplace de bodegas vive de fotos reales | Trust real. Sube conversión PDP 20-30% | L | frontend + backend | upload imágenes (Vercel Blob) |
| **MK-31** | **Programa de puntos cross-store** ("Buleje points") visible en mi-cuenta + canjeable. Conecta con gift-cards | Diferencia vs. competencia local. Lifetime value +40% | XL | backend + ai-ml-engineer | nueva tabla DB + reglas |
| **MK-32** | **Notificaciones push** (web push) para: pedido confirmado, pedido en camino, oferta del día, cupón próximo a expirar | Engagement +35%. Re-activación | M | integrator + backend | service worker existente |
| **MK-33** | **Direcciones favoritas con etiquetas** (Casa / Oficina / Mamá) con iconos custom y default. Hoy son listas planas | UX delivery moderna | XS | frontend | — |
| **MK-34** | **Cupones inteligentes que sugieren producto faltante**: "Te sobra S/2 para usar el cupón — agregá X" | Sube uso de cupones 50%+ | M | frontend + ai-ml-engineer | rules engine existente |

---

## WS5 — Content & Engagement

> Foco: contenido vivo (recetas, lives, ofertas) que mantiene al usuario navegando aunque no compre hoy.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-35** | **Para-vos rediseñado** como feed personalizado tipo TikTok: cards verticales con producto, reseña, receta, oferta intercaladas. Scroll vertical | Engagement marketplace +50%. Único en LATAM bodegas | L | ai-ml-engineer + frontend | recommendations engine |
| **MK-36** | **Lives en vivo destacados en home**: card grande con "EN VIVO ahora" cuando hay lives activos. Hoy escondido en /en-vivo | Conversión live commerce 8-15× normal | S | frontend | endpoint lives/active ya existe |
| **MK-37** | **Recetas con ingredientes auto-comprables**: "Comprar todo (S/X)" — agrega los 8 ingredientes de la receta al carrito en un click | Crea ticket promedio gigante. Único | M | frontend + backend | mapping receta→productos |
| **MK-38** | **Ofertas con countdown timer real** y "X personas viendo esta oferta" (Server-Sent Events) | Urgencia genuina. Sube CTR ofertas 30-50% | M | backend + frontend | SSE infra |
| **MK-39** | **Stories del marketplace** estilo Instagram en home: "Promociones del día", "Productos nuevos", "Recetas". Tap → fullscreen vertical | Mobile-first engagement. Estilo gen-Z/millennial | L | frontend + marketplace-specialist | upload tooling |
| **MK-40** | **Chef IA expandido** (ya existe `ChefIACard`): conversación "¿qué cocino con 50 soles?" → arma carrito completo | Asistente único. Cierra ventas indecisas | L | ai-ml-engineer + backend | chat existente |
| **MK-41** | **Newsletter inteligente diario**: "3 ofertas para vos hoy" via email/WhatsApp basado en historial | Reactivación masiva. Open rate 35%+ esperado | M | integrator + ai-ml-engineer | email pipeline |

---

## WS6 — Performance & Tech (Cross-Cutting)

> Foco: lo que hace que TODO se sienta rápido. Aplica transversalmente.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-42** | **Server Components + `"use cache"` en todas las pages estables** (home, recetas, en-vivo). Algunas ya están — auditar y completar | LCP -300-500ms. Vercel cost -60% | M | performance-engineer | ADR-019 |
| **MK-43** | **Edge caching de listados públicos** (`/marketplace`, `/marketplace/explorar`) con `cacheTag` invalidación al crear OC/producto | Latencia -80% en listados | M | performance-engineer + database | Next 16 cacheTag |
| **MK-44** | **Lazy load de carruseles + below-the-fold** con IntersectionObserver. Hoy `RecentlyViewed` y `PersonalizedRecommendations` cargan inmediatamente | -200KB JS shipped initially | S | frontend + performance-engineer | — |
| **MK-45** | **Image optimization audit**: detectar imágenes >200KB, AVIF/WebP enforcement, lazy loading consistente, srcset apropiado | LCP -400ms. Bandwidth -70% | M | performance-engineer | next/image config |
| **MK-46** | **Bundle splitting agresivo**: separar checkout/payment/admin en chunks aparte del initial. Hoy initial bundle es grande | Time to Interactive -1.5s mobile | M | performance-engineer | next.config.ts |
| **MK-47** | **Prefetch on hover** en cards de producto/store (ya existe `usePrefetchOnHover` — auditar uso global) | Navegación se siente instantánea | S | frontend | — |
| **MK-48** | **Service Worker offline-first** para shell del marketplace + last-seen products. Hoy hay SW pero no offline shell | UX cuando hay internet flaky (común en Pucallpa) | M | frontend + performance-engineer | manifest existente |
| **MK-49** | **DB index audit en queries marketplace**: `MarketplaceListing(tenantId, active, deletedAt)`, `Order(userId, status, createdAt DESC)`. Pueden faltar | Queries 5-50× más rápidos | M | database | prisma migrate plan |

---

## WS7 — Mobile, Tablet & A11y

> Foco: el 80% del tráfico de un marketplace local es mobile. Auditar todo en touch.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-50** | **BottomNav rediseñado** con 5 tabs estables (Home / Buscar / Carrito / Pedidos / Mi-cuenta) + badge de pedido en curso | UX delivery app moderna. Aumenta uso 40% | S | frontend | — |
| **MK-51** | **Touch targets ≥44px** auditados con Playwright. Hoy hay botones 32px que fallan en touch | Reduce frustración mobile. WCAG 2.5.5 | S | tester + frontend | — |
| **MK-52** | **Pull-to-refresh** en home, listados y carrito | Esperado en mobile. UX moderna | S | frontend | — |
| **MK-53** | **Gestos swipe**: borrar item del carrito con swipe izquierdo, agregar a favoritos con swipe derecho | UX delivery apps. Engagement +20% | M | frontend | gesture lib |
| **MK-54** | **A11y audit completo**: aria-labels, contraste, keyboard nav, focus rings. Pages críticas: home, PDP, checkout | Cumplimiento WCAG AA. SEO y legal | M | tester | playwright a11y plugin |
| **MK-55** | **Modo claro/oscuro** robusto (hoy `bg-white` hardcoded en muchos lugares — falta dark mode coherente) | UX expectativa moderna. Comodidad uso nocturno | L | frontend | design-system tokens |

---

## WS8 — Trust, Social Proof & Conversión

> Foco: elementos que convencen al usuario a comprar.

| ID | Mejora | Por qué importa | Esfuerzo | Owner | Depende de |
|---|---|---|---|---|---|
| **MK-56** | **Badges de confianza** en cards y PDP: "Bodega verificada" / "Entrega <30 min" / "Top vendedor del mes" / "Nuevo" | Sube conversión 12-25% (consistente en todos los marketplaces) | S | frontend + database | criterios badges |
| **MK-57** | **Reseñas en card de tienda** (estrellas + count) ya existe parcial — hacerlo prominente en card grande | Trust social inmediato | XS | frontend | — |
| **MK-58** | **"Última compra hace X min"** en cards de productos populares (anonimizado): "Comprado hace 12 min" | Social proof tiempo real. Sube CTR 15% | S | frontend + backend | endpoint nuevo |
| **MK-59** | **Garantía de frescura/devolución** visible en footer cards y checkout: "Si no llegó fresco, te devolvemos" | Reduce fricción de primer pedido | XS | frontend | mensaje legal |
| **MK-60** | **Comparativa precio vs. supermercado tradicional** en productos clave: "S/2.50 más barato que Plaza Vea" | Posicionamiento competitivo Pucallpa | M | data-analyst + frontend | pricing data manual |
| **MK-61** | **Programa de referidos visible**: "Invitá a un amigo, ambos ganan S/10". Card en home + my-account | Adquisición barata. CAC -60% | M | backend + frontend | rules engine |
| **MK-62** | **Live counter de pedidos**: "1,247 pedidos entregados esta semana en Pucallpa" en footer/home | Trust social city-level. Diferenciador local | S | frontend + backend | aggregator query |

---

## Plan de ejecución sugerido (Sprints de 2 semanas)

### Sprint 1 — Quick wins de conversión (Total ~12 items)
- WS3 MK-19, MK-20, MK-25 (cart fixes)
- WS1 MK-03, MK-09 (filtros sticky + WhatsApp empty)
- WS6 MK-44, MK-47 (lazy load + prefetch)
- WS8 MK-56, MK-57, MK-58 (trust badges)
- WS7 MK-50, MK-51 (mobile basics)

### Sprint 2 — Search & Discovery (Total ~10 items)
- WS1 MK-01, MK-02, MK-05, MK-06, MK-07, MK-08
- WS2 MK-10, MK-12, MK-13, MK-18

### Sprint 3 — Engagement & Loyalty (Total ~12 items)
- WS5 MK-35, MK-36, MK-37, MK-38
- WS4 MK-27, MK-28, MK-29, MK-32, MK-33, MK-34
- WS8 MK-61, MK-62

### Sprint 4 — Heavy lifting (Total ~10 items)
- WS3 MK-23, MK-24 (guest + one-page)
- WS4 MK-30, MK-31 (reseñas + puntos)
- WS5 MK-39, MK-40, MK-41
- WS2 MK-14, MK-16

### Sprint 5 — Tech debt & polish (Total ~10 items)
- WS6 MK-42, MK-43, MK-45, MK-46, MK-48, MK-49
- WS7 MK-52, MK-53, MK-54, MK-55

---

## Cómo despachar a agent teams

Cada workstream se asigna a **un team paralelo**:

```
team-marketplace-discovery (WS1)  → marketplace-specialist + frontend + backend
team-marketplace-catalog (WS2)    → frontend + backend + ai-ml-engineer
team-marketplace-checkout (WS3)   → checkout-specialist + backend + tester
team-marketplace-account (WS4)    → frontend + backend + integrator
team-marketplace-content (WS5)    → marketplace-specialist + ai-ml-engineer
team-marketplace-perf (WS6)       → performance-engineer + database + deployer
team-marketplace-mobile (WS7)     → frontend + tester
team-marketplace-trust (WS8)      → marketplace-specialist + seo-growth-strategist
```

Cada team se lanza con `TeamCreate` + `Agent` calls en paralelo desde el director.
Cada item tiene **commit prefix sugerido**: `feat(mk-XX): descripción` para trazabilidad.

## Métricas de éxito

| Workstream | Métrica clave | Target Sprint 5 |
|---|---|---|
| WS1 | Search CTR | +30% |
| WS2 | PDP → Add to Cart | +20% |
| WS3 | Cart abandonment | -25% |
| WS4 | Repeat order rate | +35% |
| WS5 | Avg session duration | +40% |
| WS6 | LCP / CLS / INP | LCP <2.0s · CLS <0.1 · INP <200ms |
| WS7 | Mobile bounce rate | -20% |
| WS8 | Conversion rate | +15-25% |

## Dependencias cross-WS críticas

```
MK-14 (cross-sell smart) → necesita MK-49 (DB indexes)
MK-23 (one-page checkout) → necesita MK-24 (guest checkout) primero
MK-31 (puntos) → necesita MK-30 (reviews) para granularidad
MK-35 (feed para-vos) → necesita MK-40 (chef IA) para sugerencias contextuales
```

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Cambios en checkout rompen pagos | Feature flag por usuario + canary 5%→25%→100% |
| Personalización requiere data privada | Cumplir Ley 29733 — opt-in explícito + consent storage |
| Multi-store cross-sell inconsistente con commission | Coordinar con módulo billing antes de Sprint 4 |
| Stories/Lives requieren upload pesado | CDN (Vercel Blob) configurado antes de MK-39 |

---

**Versión 1.0** — Última actualización 2026-04-25
**Mantenedor:** este blueprint vive en repo. Actualizar al cerrar cada sprint con métricas reales y mover items completados a sección "Done".
