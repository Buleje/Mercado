# 🗺️ MASTER ROADMAP — Mejoras consolidadas Bodega San Martín

> **Fecha:** 2026-04-09
> **Research base:** 6 scout agents paralelos — ~86 mejoras candidatas analizadas
> **Consolidación:** Orquestador ingeniero-jefe (Jefe Obsesivo Nivel 4)
> **Objetivo:** Master roadmap priorizado por impacto × esfuerzo × urgencia

---

## 📊 Research sources

| # | Agent scope | Archivo | Mejoras |
|---|---|---|---|
| 1 | Marketplace | `marketplace-improvements-2026-04-09.md` | 14 |
| 2 | Admin Modules (26) | `admin-modules-improvements-2026-04-09.md` | 18 |
| 3 | Superadmin | `superadmin-improvements-2026-04-09.md` | 12 |
| 4 | Tienda individual | `store-individual-improvements-2026-04-09.md` | 14 |
| 5 | Cross-cutting (sec/perf/AI/obs) | `cross-cutting-improvements-2026-04-09.md` | 13 |
| 6 | Product & UX (flujos E2E) | `product-ux-improvements-2026-04-09.md` | 13 |
| | **TOTAL** | | **84** |

---

## 🚨 HALLAZGOS CRÍTICOS ENCONTRADOS (bugs silenciosos corrigiendo plata YA)

Los agents descubrieron **6 bugs graves** que están corrompiendo data o reportando números falsos hoy mismo:

| # | Bug | Qué rompe | Severidad |
|---|---|---|---|
| 🔴 1 | **PlatformSettings en `localStorage`** (superadmin/settings) | **MRR que reporta el dashboard está MENTIROSO** — off-by-100/tenant enterprise (`pricePro: 49`, `priceBusiness: 149`, `priceEnterprise: 399` vs `499`) | **CRÍTICA** |
| 🔴 2 | **Tenants fantasma** en `marketplace/stores/apply` | `tenantId = store-${phone}` crea IDs falsos → Order.tenantId nunca matchea → tiendas huérfanas que no reciben pedidos | **CRÍTICA** |
| 🔴 3 | **Rate limit NO distribuido** (`Map` in-memory en Vercel Edge) | Atacante con 10 replicas bypass × 10 — 60 req/min config = 600 req/min reales | **ALTA** |
| 🔴 4 | **Abandoned cart email va al ADMIN, no al CLIENTE** | Feature existe pero 0% recovery real — el cliente jamás recibe el WhatsApp que lo traería de vuelta | **ALTA** |
| 🔴 5 | **Daily briefing promete WhatsApp pero solo manda Email** | Step 5 del onboarding le dice al dueño "te mandaremos resumen por WhatsApp" — NO se cumple | **ALTA** |
| 🔴 6 | **Churn engine NO corre** — schema `TenantHealthScore`+`ChurnSignal`+`ChurnPlaybook` existe pero sin motor | Dashboard de churn muestra datos vacíos/viejos, playbooks no ejecutan | **ALTA** |

**Total bugs críticos:** 6 — todos se arreglan en Sprint 1 del master roadmap (ver Tier S abajo).

---

## 🏆 TIER S — Top 15 mejoras de MÁXIMO impacto (ejecutar ya)

Las 15 que mueven realmente la aguja, ordenadas por ROI real. Cualquier roadmap que no las incluya está mal priorizado.

| # | Mejora | Scope | Tipo | Impacto estimado | Esfuerzo | Prio |
|---|---|---|---|---|---|---|
| **1** | 🔴 **Fix PlatformSettings fake MRR** | Superadmin | 🐛 fix crítico | Dashboard reporta números reales → decisiones basadas en data no mentira | S (1 día) | **P0** |
| **2** | 🔴 **Fix tenants fantasma apply flow** | Marketplace | 🐛 fix crítico | Previene data corruption cada día que pasa — tiendas nuevas entran sanas | S (1-2 días) | **P0** |
| **3** | 🔴 **Rate limit distribuido Upstash** | Cross-cutting / Seguridad | 🐛 fix crítico | Cierra vector de DoS real explotable hoy | S (0.5 día) | **P0** |
| **4** | 🔴 **Abandoned cart → WhatsApp al cliente** | Product UX | 🐛 fix crítico | Recovery 8-12% = +S/300-420/mes/tenant | S (2-3 días) | **P0** |
| **5** | 🔴 **Daily briefing WhatsApp al dueño** (cumplir promesa onboarding) | Product UX | 🐛 fix crítico | DAU admin +25%, feature adoption +300% (hoy 0%) | S (3-5 días) | **P0** |
| **6** | 🔴 **Churn engine cron + playbook executor** | Superadmin | ✅ completar | -20-30% churn rate, retention directo. Schema ya existe. | M (1 sem) | **P0** |
| **7** | 📈 **CRM+RFM integrado + campañas por segmento** | Admin CRM | ✅ completar | Infra ya existe, 2h de cableado = reactivación clientes dormidos | S (1 día) | **P0** |
| **8** | 🆕 **Checkout multi-vendor + split payment (Payout cycle tandem)** | Marketplace | 🆕+📈 | Sin esto, el marketplace es catálogo agregado, no marketplace real. Rappi-model unlock. | L (2-3 sem) | **P0** |
| **9** | ✅ **Cupones por tienda (TD-032)** | Marketplace | ✅ completar | Desbloquea welcome coupons, flash sales por tienda, promos de apertura | M (1 sem) | **P0** |
| **10** | 🆕 **Catálogo pre-cargado 200 productos peruanos** en onboarding | Product UX | 🆕 | Time-to-first-sale 3 días → 20 min. Activation +40% | M (1 sem) | **P0** |
| **11** | 🆕 **Flujo de caja 13 semanas rodante** | Admin Finanzas | 🆕 | Reporte #1 que pide todo dueño. Diferenciador vs Loyverse/Alegra. | M (2 sesiones) | **P0** |
| **12** | ✅ **FEFO enforceado en venta** (lotes cercanos a vencer se eligen primero) | Admin Inventario | ✅ completar | Pérdida real S/200-500/mes evitable en perecibles | M (2 sesiones) | **P0** |
| **13** | 🆕 **Recetas con costo real + descuento stock** | Admin Recetas | 🆕 | Módulo hoy 100% cosmético → operacional. Desbloquea bodegas con cocina. | M (2 sesiones) | **P0** |
| **14** | 🆕 **Paridad `/t/[slug]/tienda` con tienda Buleje** | Store individual | ✅ completar | Tenants SaaS hoy reciben experiencia degradada vs dogfood Buleje. Diferencia vida/muerte del producto SaaS. | L (2-3 sem) | **P0** |
| **15** | 🆕 **Self-signup de proveedor** (hoy solo API key manual) | Product UX / Marketplace | 🆕 | Desbloquea supply-side del marketplace. 0 → 5-20 proveedores/mes. | M (1 sem) | **P0** |

**Esfuerzo Tier S total:** ~10-14 semanas con 1 dev + Claude Code + agent teams. Pero 6 de las 15 son **S (≤3 días)** y pueden hacerse en 1-2 semanas → unlock inmediato.

---

## 📦 TIER A — Mejoras estratégicas siguiente ola (16 mejoras)

Alto impacto, pero Tier S primero.

| # | Mejora | Scope | Tipo | Esfuerzo |
|---|---|---|---|---|
| 16 | 🆕 **Billing real Stripe webhook → BillingInvoice model + MRR calculado desde DB** | Superadmin | 🆕 | L (2-3 sem) |
| 17 | 🆕 **Wishlist + favoritos persistentes cross-store** | Marketplace / Store | 🆕 | M |
| 18 | 🆕 **KYC básico de vendedores + badge "Verificado"** | Marketplace | 🆕 | M |
| 19 | 🆕 **Churn B2C por cliente final** (score de riesgo + tab "En riesgo" con acciones) | Admin CRM | 🆕 | M |
| 20 | ✅ **OC sugerida auto-creada desde auto-reorder** (HITL) | Admin Compras | ✅ completar | M |
| 21 | 🆕 **Conciliación bancaria real** (CSV BCP/Interbank/BBVA → match fuzzy) | Admin Finanzas | 🆕 | L |
| 22 | 🆕 **Pedido recurrente / suscripción** (semanal abarrotes) | Store individual | 🆕 | L |
| 23 | 🆕 **Boleta/RUC en checkout** (desbloquea B2B) | Store individual | 🆕 | M |
| 24 | 📈 **Auto-reorder "comprar lo de siempre"** | Store individual | 📈 expansión | S-M |
| 25 | 🆕 **Feature flags per-tenant (DB override)** (rollouts 1% → 100%) | Cross-cutting | 🆕 | M |
| 26 | 🆕 **Superadmin 2FA real** (TOTP persistente + email fallback) | Superadmin | 📈 | S |
| 27 | 🆕 **Cost tracking per tenant** (Supabase bytes + Groq tokens + Blob GB) | Superadmin | 🆕 | M |
| 28 | ✅ **Conteo cíclico ABC** en inventario (generar hojas de conteo) | Admin Inventario | 🆕 | M |
| 29 | 🆕 **Guest checkout real** (saltar paso cuenta por default) | Store individual | 📈 | S |
| 30 | 📈 **Scarcity real en ProductCard + PDP** ("solo quedan 3") | Store individual | 📈 | S |
| 31 | 🆕 **Abandoned cart recovery real** (quitar stub `MarketplaceAbandonedCart`) | Marketplace | ✅ completar | M |

---

## 📋 TIER B — Mejoras complementarias (15 mejoras)

| # | Mejora | Scope | Esfuerzo |
|---|---|---|---|
| 32 | Wishlist persistente cross-store | Marketplace | M |
| 33 | Disputas cliente-vendedor con SLA 48h | Marketplace | M |
| 34 | Tiers de vendedor (free/pro/elite) con subscription | Marketplace | L |
| 35 | Cross-vendor loyalty points unificados | Marketplace | M |
| 36 | Scorecard proveedor visible en PuntoDeCompraTab | Admin Compras | S |
| 37 | Hook universal `useTableExport()` (reemplaza 20 implementaciones) | Admin transversal | M |
| 38 | Quick actions en Command Palette (Ctrl+K = acción) | Admin transversal | S |
| 39 | Unified Support Inbox cross-tenant (SupportTicket ya existe) | Superadmin | S |
| 40 | Tenant Lifecycle Timeline (trial → active → at-risk → churned) | Superadmin | M |
| 41 | POS offline-first persistente IndexedDB | Admin POS | M |
| 42 | Cache pattern replication (home promos, product list, settings) | Cross-cutting | S |
| 43 | CSP tightening (quitar `'unsafe-eval'`) | Cross-cutting | S |
| 44 | CSRF double-submit cookie | Cross-cutting | S |
| 45 | 2FA para tenant admin (TOTP) | Cross-cutting | S |
| 46 | Admin mobile bottom bar con 5 accesos | Admin transversal | S |

---

## 🎯 TIER C — Backlog priorizado (resto)

Mejoras que valen la pena pero no urgentes. Ver archivos individuales para detalle.

| Scope | Cantidad |
|---|---|
| Marketplace (flash sales, banners rotativos, ads-as-a-service) | 4 |
| Admin (libro mayor contable, empty states, analytics reubicación, loyalty transaction persist) | 6 |
| Superadmin (IP allowlist, weekly digest founder, snapshots) | 4 |
| Store individual (reviews con fotos, delivery schedule, búsqueda por voz consolidada) | 5 |
| Cross-cutting (Capacitor FCM nativo, quechua i18n, daily digest email dueño) | 5 |
| Product-UX (progress bar loyalty tier, modo señora mayor, comunidad WhatsApp bodegueros) | 6 |

---

## 🔗 Relación con ROADMAP-24-WEEKS existente (ADR 016)

El master roadmap **COMPLEMENTA** el Roadmap 24 semanas — no lo reemplaza. Mapping:

| Tier S nuevo | Sprint en Roadmap 24w | Relación |
|---|---|---|
| #1-6 Fixes críticos (MRR, tenants fantasma, rate limit, abandoned cart, churn) | Sprint 1-2 | **Agregados** — no estaban explícitos, son bugs descubiertos |
| #7 CRM+RFM | Sprint 1 | ✅ alineado con "Dashboard admin aggregates" |
| #8 Checkout multi-vendor | Sprint 4 Marketplace Economy | ✅ alineado con "Marketplace bilateral KYC + ledger" |
| #9 Cupones por tienda | — | **Nuevo** (TD-032 existente, no estaba en roadmap) |
| #10 Catálogo pre-cargado | Sprint 1-2 | ✅ alineado con "Onboarding self-service end-to-end" Tier S |
| #11 Flujo caja 13 semanas | Sprint 3 Retención | **Nuevo** (no estaba) |
| #12 FEFO venta | — | **Nuevo** (descubierto en research) |
| #13 Recetas con costo | — | **Nuevo** (descubierto en research) |
| #14 Paridad tienda SaaS | Sprint 4-5 | **Crítico** — debería subir de prioridad |
| #15 Self-signup proveedor | Sprint 4 | ✅ alineado con "KYC + payouts" |

**Conclusión:** el Roadmap 24w sigue válido. Nuestro research **agrega 6 fixes críticos previamente invisibles + 3 mejoras estructurales nuevas** (flujo caja, FEFO, recetas) que deberían meterse en Sprint 1-3.

---

## 💰 Features que generan revenue directo

Ordenadas por ROI financiero esperable:

1. **#16 Billing real Stripe** → 5x ARPU unlock (ADR 016 Sprint 2)
2. **#8 Checkout multi-vendor + Payout cycle** → transforma marketplace en marketplace real
3. **#6 Pricing en soles** + Yape (no en el top 15 pero quick win) → free→pro +60%
4. **#34 Tiers de vendedor con subscriptions** → MRR predecible, 5x revenue diversification
5. **#27 Cost tracking per tenant** → prioriza upgrades en tenants grandes
6. **#9 Cupones por tienda** → habilita promos de apertura de vendedores nuevos

---

## 🛡️ Features de seguridad / compliance

Ordenadas por riesgo mitigado:

1. **#3 Rate limit distribuido** — cierra DoS real
2. **#2 Tenants fantasma fix** — previene data corruption multi-tenant (privacy)
3. **#44 CSRF double-submit** — cierra CSRF real
4. **#26 Superadmin 2FA real** — protege llave maestra
5. **#45 2FA tenant admin** — protección cuentas admin
6. **#43 CSP tightening** — mitigate XSS
7. **KYC vendedores (#18)** — compliance Ley 29733 Peru + anti-fraude
8. **GDPR/29733 export tenant** (Tier C) — compliance legal

---

## 📊 Métricas que Brandon debe empezar a medir HOY

El Product-UX-Scout encontró que **estas métricas críticas NO se miden**:

| Métrica | Por qué importa | Dónde medirla |
|---|---|---|
| Activation rate (primer valor en 7 días) | La métrica #1 de SaaS | New tenant signup → first sale dentro de 7 días |
| Time-to-first-sale | Proxy de activation | signup timestamp → first sale timestamp |
| Time-to-first-fiado | Proxy de uso del diferenciador | signup → first fiado creado |
| DAU / WAU / MAU admin | Retention base | logins por tenant |
| Feature adoption rate por módulo | Qué módulos se usan vs olvidan | `ActivityLog` por módulo |
| Abandoned cart rate | Leak de revenue | `CartContext` eventos |
| Repeat purchase rate (cliente final) | LTV proxy | Orders groupBy customerPhone |
| Customer churn score (B2C) | Reactivación targetable | score computed nightly |
| NPS tenant / NPS cliente final | Trust + satisfaction | survey periódico |
| Session duration admin | Stickiness | analytics |

---

## 🧱 Lo que NO tocar / NO hacer

Del research consolidado — todos los agents coinciden:

- ❌ **`components/checkout/*`** sin skill `checkout-flow` + checkout-squad
- ❌ **`lib/auth/role-permissions.ts`** sin audit security
- ❌ **`proxy.ts` + `lib/middleware/*`** sin ADR nuevo
- ❌ **`prisma/schema.prisma`** sin migration-planner + DIRECT_URL + ADR
- ❌ **Reemplazo de Algolia/Meilisearch** — el search actual con fuzzy + did-you-mean basta
- ❌ **AI chatbot separado** — ya existe recommendations, no duplicar
- ❌ **Multi-idioma quechua** — fuera de scope Pucallpa 2026 (aunque es diferenciador marketing)
- ❌ **NFT/web3/crypto** — no
- ❌ **Reescribir framer-motion por otra lib**
- ❌ **Refactor total de sponsored-ranker** — funciona, es bike-shedding
- ❌ **Storybook-static / worktrees orphan** — ya eliminados en sesión anterior

---

## 🚀 Propuesta de ejecución — 3 olas

### 🌊 Ola 1 — "Arreglar lo roto" (Sprint 1, ~2 semanas)

**Enfoque:** fix de los 6 bugs críticos + 3 quick wins. Todo P0 de Tier S que es esfuerzo S (≤3 días).

**Paquete:**
- #1 Fix PlatformSettings MRR
- #2 Fix tenants fantasma
- #3 Rate limit Upstash
- #4 Abandoned cart → cliente WhatsApp
- #5 Daily briefing WhatsApp dueño
- #7 CRM+RFM cableado
- #9 Cupones por tienda (TD-032)
- #12 FEFO enforcement (si esfuerzo lo permite)

**Resultado:** la plataforma reporta MRR real + rate limit funcional + recovery de carts + feature adoption ×3 del resumen diario + CRM con segmentos accionables.

### 🌊 Ola 2 — "Core del negocio" (Sprints 2-3, ~4 semanas)

**Enfoque:** features estructurales que desbloquean la siguiente etapa.

**Paquete:**
- #6 Churn engine (cron + playbook)
- #10 Catálogo pre-cargado onboarding
- #11 Flujo caja 13 semanas
- #13 Recetas con costo + descuento stock
- #8 Checkout multi-vendor + Payout cycle (split en dos sprints)
- #15 Self-signup proveedor
- #16 Billing real Stripe

### 🌊 Ola 3 — "Scale + paridad SaaS" (Sprints 4-5, ~4 semanas)

**Enfoque:** paridad de la tienda SaaS + features avanzadas.

**Paquete:**
- #14 Paridad `/t/[slug]/tienda` con Buleje (el gran refactor arquitectónico)
- #18 KYC vendedores
- #19 Churn B2C por cliente final
- #20 OC sugerida auto-reorder HITL
- #22 Pedido recurrente suscripción
- #23 Boleta/RUC en checkout
- #25 Feature flags per-tenant

**Total:** ~10 semanas para Tier S + Tier A principales. Alinea con Sprints 1-5 del Roadmap 24w.

---

## 📎 Links a los 6 research files

- [Marketplace](./marketplace-improvements-2026-04-09.md) — 14 mejoras, enfoque multi-vendor
- [Admin Modules](./admin-modules-improvements-2026-04-09.md) — 18 mejoras, 26 módulos
- [Superadmin](./superadmin-improvements-2026-04-09.md) — 12 mejoras, platform ops
- [Store individual](./store-individual-improvements-2026-04-09.md) — 14 mejoras, cliente final
- [Cross-cutting](./cross-cutting-improvements-2026-04-09.md) — 13 mejoras, sec/perf/AI
- [Product & UX](./product-ux-improvements-2026-04-09.md) — 13 mejoras, flujos E2E

---

**Generado por:** Orquestador ingeniero-jefe tras dispatch de 6 agent teams paralelos
**Mandato:** Jefe Obsesivo Nivel 4 (feedback_obsessive_boss_level4.md)
**Próximo paso sugerido:** Brandon elige Ola 1 completa para arrancar en próxima sesión
