# Diagnostico del Roadmap — 2026-04-10

## Resumen ejecutivo

84 items totales, 8 completados (9.5%). 76 pendientes. Los 7 items Tier S restantes son los de mayor impacto — completarlos lleva el negocio de "demo bonita" a "producto vendible". La ruta mas rapida al 50% es atacar los 34 items de menor esfuerzo (S/M) primero, dejando los 4 items L/XL para olas dedicadas.

---

## Estado actual

| Metrica | Valor |
|---------|-------|
| Total items | 84 |
| Completados | 8 (9.5%) |
| Pendientes | 76 |
| Bloqueados por dependencia | 7 |
| Bloqueados por infra (env vars) | 1 (#3 Upstash) |

## Items completados (8)

| # | Item | Tier |
|---|------|------|
| 1 | Fix MRR prices | S |
| 2 | Fix tenants fantasma | S |
| 4 | Abandoned cart WhatsApp | S |
| 5 | Daily briefing WhatsApp | S |
| 6 | Churn engine cron | S |
| 7 | CRM + RFM integration | S |
| 10 | Catalogo 201 productos | S |
| 12 | FEFO enforceado POS | S |

---

## 76 pendientes clasificados por impacto

### 🔴 CRITICOS — bloquean ventas o rompen produccion (7)

| # | Item | Tier | Effort | Deps |
|---|------|------|--------|------|
| 3 | Rate limit Upstash | S | S | BLOQUEADO (env) |
| 8 | Checkout multi-vendor + Payout | S | L | #2 done |
| 9 | Cupones por tienda | S | M | - |
| 14 | Paridad tienda slug | S | L | - |
| 29 | Guest checkout real | A | S | - |
| 44 | CSRF double-submit cookie | B | S | - |
| 43 | CSP tightening | B | S | - |

### 🟠 ALTOS — mejoran experiencia o generan ingresos (19)

| # | Item | Tier | Effort | Deps |
|---|------|------|--------|------|
| 11 | Flujo caja 13 semanas | S | M | - |
| 13 | Recetas costo real | S | M | - |
| 15 | Self-signup proveedor | S | M | - |
| 19 | Churn B2C cliente final | A | M | - |
| 20 | OC sugerida auto-reorder | A | M | - |
| 23 | Boleta/RUC checkout | A | M | - |
| 24 | Auto-reorder "comprar siempre" | A | S | - |
| 25 | Feature flags per-tenant | A | M | - |
| 26 | Superadmin 2FA real | A | S | - |
| 28 | Conteo ciclico ABC | A | M | - |
| 30 | Scarcity real ProductCard | A | S | - |
| 31 | Abandoned cart recovery real | A | M | - |
| 17 | Wishlist favoritos | A | M | - |
| 27 | Cost tracking per tenant | A | M | #1 done |
| 36 | Scorecard proveedor | B | S | - |
| 38 | Quick actions Command Palette | B | S | - |
| 39 | Unified Support Inbox | B | S | - |
| 42 | Cache pattern replication | B | S | - |
| 46 | Admin mobile bottom bar | B | S | - |

### 🟡 MEDIOS — calidad de vida (17)

| # | Item | Tier | Effort | Deps |
|---|------|------|--------|------|
| 16 | Billing Stripe webhook | A | L | #1 done |
| 18 | KYC vendedores | A | M | #8 |
| 21 | Conciliacion bancaria | A | L | - |
| 22 | Pedido recurrente | A | L | - |
| 33 | Disputas cliente-vendedor | B | M | - |
| 34 | Tiers vendedor subscription | B | L | #16 |
| 35 | Cross-vendor loyalty | B | M | - |
| 37 | Hook useTableExport() | B | M | - |
| 40 | Tenant Lifecycle Kanban | B | M | #6 done |
| 41 | POS offline IndexedDB | B | M | - |
| 45 | 2FA tenant admin | B | S | #26 |
| 32 | Wishlist extension marketplace | B | M | #17 |
| 47 | Flash sales cross-vendor | C | M | - |
| 52 | Empty states accionables | C | M | - |
| 60 | Delivery schedule slots | C | M | - |
| 61 | Reviews con fotos | C | M | - |
| 63 | WhatsApp post-compra | C | M | - |

### 🟢 BAJOS — nice to have (33)

| # | Item | Tier | Effort |
|---|------|------|--------|
| 48-50, 53-59, 62, 64-84 | Tier C items | C | S-M |

---

## Top 20 mayor impacto / menor esfuerzo

| Rank | # | Item | Effort | Impacto negocio |
|------|---|------|--------|-----------------|
| 1 | 29 | Guest checkout real | S | Conversion +15-25% |
| 2 | 24 | Auto-reorder "comprar siempre" | S | Retention +40% |
| 3 | 30 | Scarcity real ProductCard | S | Conversion +8-12% |
| 4 | 9 | Cupones por tienda | M | Welcome coupons, flash sales |
| 5 | 11 | Flujo caja 13 semanas | M | Diferenciador #1 vs competencia |
| 6 | 13 | Recetas costo real | M | Desbloquea bodegas con cocina |
| 7 | 15 | Self-signup proveedor | M | Supply-side growth |
| 8 | 19 | Churn B2C cliente | M | Recovery 25% clientes dormidos |
| 9 | 23 | Boleta/RUC checkout | M | AOV B2B +80% |
| 10 | 26 | Superadmin 2FA real | S | Seguridad llave maestra |
| 11 | 42 | Cache pattern replication | S | -400ms LCP |
| 12 | 44 | CSRF double-submit | S | Cierra vector seguridad |
| 13 | 38 | Quick actions Ctrl+K | S | Power users 3-5x faster |
| 14 | 39 | Support Inbox | S | Single-founder inbox |
| 15 | 46 | Admin mobile bottom bar | S | Operacion movil |
| 16 | 36 | Scorecard proveedor | S | Decisiones compra informadas |
| 17 | 20 | OC sugerida auto-reorder | M | Ahorra 1-2h/semana |
| 18 | 25 | Feature flags per-tenant | M | Rollouts graduales |
| 19 | 43 | CSP tightening | S | Mitiga XSS |
| 20 | 27 | Cost tracking per tenant | M | Identifica tenants parasito |

---

## Recomendacion: Olas 2-9

Meter los top 20 en las primeras 4 olas. Despues rellenar con items C-tier S effort hasta llegar a 42+ items done (50%).
