# Plan de ejecucion — Olas 2 a 9

**Objetivo:** Llevar roadmap de 9.5% (8/84) a 50%+ (42+/84)
**Items a completar:** 34 en 8 olas (4-5 por ola)
**Resultado esperado:** 42/84 = 50% al cerrar Ola 9

---

## Vista general

| Ola | Items | Objetivo negocio | Effort | Riesgo | Acumulado |
|-----|-------|-----------------|--------|--------|-----------|
| 2 | #9,#11,#13,#15 | Cerrar Tier S restante (operacional) | 4M | Bajo | 12/84 (14%) |
| 3 | #29,#24,#30,#23 | Conversion + retention tienda | 3S+1M | Bajo | 16/84 (19%) |
| 4 | #19,#20,#26,#42,#44 | Churn + seguridad + performance | 2M+3S | Bajo | 21/84 (25%) |
| 5 | #25,#27,#38,#39,#46 | Platform tools + admin UX | 2M+3S | Bajo | 26/84 (31%) |
| 6 | #17,#28,#36,#43,#31 | Marketplace + inventario avanzado | 3M+2S | Medio | 31/84 (37%) |
| 7 | #40,#35,#37,#50,#53 | Lifecycle + loyalty + cleanup | 3M+2S | Bajo | 36/84 (43%) |
| 8 | #48,#49,#54,#55,#67 | Quick C-tier (volumen) | 5S | Bajo | 41/84 (49%) |
| 9 | #62,#64,#70,#71,#74,#78 | UX polish + monetizacion | 6S | Bajo | 47/84 (56%) |

---

## Detalle por ola

### Ola 2 — Cerrar Tier S operacional
**Hito:** Toda la funcionalidad core del ERP esta operativa

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 9 | Cupones por tienda (TD-032) | M | back+front | schema, lib/db/coupons, VendorDashboard |
| 11 | Flujo caja 13 semanas | M | back+front | lib/finance/, CashFlowRolling.tsx |
| 13 | Recetas costo real + stock | M | back+front | RecetasModule.tsx, lib/db/recipes |
| 15 | Self-signup proveedor | M | back+front | /supplier/registrar, lib/db/supplier |

### Ola 3 — Conversion + retention tienda
**Hito:** Checkout optimizado, clientes que vuelven

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 29 | Guest checkout real | S | front | CheckoutModal (zona peligrosa!) |
| 24 | Auto-reorder "comprar siempre" | S | front | QuickReorderModal, MobileBottomNav |
| 30 | Scarcity real ProductCard | S | front | ProductCard.tsx, ProductDetail |
| 23 | Boleta/RUC en checkout | M | back+front | StepDatos, api/sunat/lookup |

### Ola 4 — Churn + seguridad + performance
**Hito:** Clientes dormidos reactivados, seguridad reforzada

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 19 | Churn B2C cliente final | M | back+front | lib/churn/customer-churn, CRM tab |
| 20 | OC sugerida auto-reorder | M | back | lib/forecasting/auto-reorder, cron |
| 26 | Superadmin 2FA real TOTP | S | back | lib/superadmin-2fa, PlatformUser |
| 42 | Cache pattern replication | S | back | 3 rutas con "use cache" |
| 44 | CSRF double-submit cookie | S | back | middleware, headers |

### Ola 5 — Platform tools + admin UX
**Hito:** Admin panel profesional, founder tools

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 25 | Feature flags per-tenant | M | back+front | TenantFeatureFlag model, UI superadmin |
| 27 | Cost tracking per tenant | M | back | TenantUsageSnapshot, /superadmin/costs |
| 38 | Quick actions Ctrl+K | S | front | CommandPalette.tsx |
| 39 | Unified Support Inbox | S | front | /superadmin/support page |
| 46 | Admin mobile bottom bar | S | front | AdminMobileBottomBar.tsx |

### Ola 6 — Marketplace + inventario avanzado
**Hito:** Marketplace con features reales, inventario pro

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 17 | Wishlist + favoritos | M | back+front | Favorite model, CatalogView |
| 28 | Conteo ciclico ABC | M | back+front | ConteoFisicoWizard, cron |
| 36 | Scorecard proveedor visible | S | front | PuntoDeCompraTab |
| 43 | CSP tightening | S | back | middleware-utils.ts |
| 31 | Abandoned cart recovery real | M | back | MarketplaceAbandonedCartsDB |

### Ola 7 — Lifecycle + loyalty + cleanup
**Hito:** Vista Kanban de tenants, loyalty unificado

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 40 | Tenant Lifecycle Kanban | M | front | /superadmin/lifecycle |
| 35 | Cross-vendor loyalty | M | back | LoyaltyTransaction model |
| 37 | Hook useTableExport() | M | front | hooks/use-table-export |
| 50 | Recently viewed persistente | S | front | localStorage + component |
| 53 | Mover ABCAnalysis a Inventario | S | front | InventoryTab tabs |

### Ola 8 — Quick C-tier (volumen)
**Hito:** 5 quick wins que suman cobertura

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 48 | Banners platform rotativos | S | front | ads component |
| 49 | Lazy loading virtualizado | S | front | CatalogView virtualized |
| 54 | Persistir LoyaltyTransaction | S | back | migration, TD-030 |
| 55 | Scoring crediticio 7 TODOs | S | back | lib/credit/ |
| 67 | Health check /api/health/deep | S | back | new route |

### Ola 9 — UX polish + monetizacion
**Hito:** 50% roadmap alcanzado, producto pulido

| # | Item | Effort | Frente | Archivos clave |
|---|------|--------|--------|---------------|
| 62 | Busqueda por voz espanol | S | front | SmartSearchBar |
| 64 | Listas compras compartibles | S | front+back | new feature |
| 70 | Progress bar loyalty visible | S | front | puntos page |
| 71 | Modo "senora mayor" sidebar | S | front | AdminNavigation |
| 74 | Plan Pro en soles + Yape | S | back+front | PlanTab |
| 78 | PWA install prompt post-compra | S | front | ServiceWorker |

---

## Dependencias criticas

```
Ola 2 (independiente) ──→ Ola 3 (#23 boleta necesita SUNAT lookup)
Ola 3 (#29 checkout) ──→ ZONA PELIGROSA (CheckoutModal)
Ola 4 (#26 2FA) ──→ Ola 5 desbloquea #45 (2FA tenant)
Ola 5 (#25 flags) ──→ Ola 6+ puede usar flags para rollout
```

## Hitos de progreso

| Despues de | Items done | Porcentaje | Significado |
|-----------|-----------|------------|-------------|
| Ola 2 | 12 | 14% | Tier S cerrado |
| Ola 4 | 21 | 25% | Cuarto del roadmap |
| Ola 6 | 31 | 37% | Tercio con creces |
| Ola 8 | 41 | 49% | Casi mitad |
| Ola 9 | 47 | 56% | **Objetivo superado** |
