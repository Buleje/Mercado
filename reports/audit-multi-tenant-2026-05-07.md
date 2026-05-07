# Auditoría Multi-Tenant Completa — 2026-05-07

> 5 agentes especializados (read-only) auditaron en paralelo: Superadmin, Admin tenant, Storefront individual, Marketplace cross-store, Multi-tenant guard.

## Score global por dominio

| Dominio | Auditor | Score | P0 | P1 | P2 |
|---|---|---|---|---|---|
| Superadmin | Code Reviewer | ⚠️ Vulnerable | 2 | 5 | 5 |
| Admin tenant + multi-tenant | Solution Architect | 7.5/10 | 5 | 5 | 5 |
| Marketplace cross-store | Marketplace Specialist | 6.0/10 | 6 | 7 | 6 |
| Security multi-tenant | Security Auditor | 8.7/10 | 0 | 4 | 5 |
| Storefront visual `/marketplace/[slug]` + `/t/[slug]` | Storefront Visual QA | 6.5/10 | 3 | 5 | 5 |
| **TOTAL** | | **~7.3/10** | **16** | **26** | **26** |

---

## P0 consolidados (16) — bloqueo crítico

### 🩸 Pérdida de dinero (Marketplace) — 2

| # | Archivo | Issue |
|---|---|---|
| M1 | `components/marketplace/MarketplaceCheckoutModal.tsx:454-459` | MP multi-vendor crea SOLO 1 preference para el primer pedido. Vendors N>1 nunca cobran. Pérdida estimada: S/500-1500/día con 50 tiendas |
| M2 | `app/api/marketplace/orders/[id]/route.ts:200` | Transición → `entregado` NO llama `recordMarketplaceCommissions()`. Comisiones quedan en `pending` para siempre. Conciliación contable rota |

### 🔓 Cross-tenant write (Marketplace) — 2

| # | Archivo | Issue |
|---|---|---|
| M3 | `app/api/marketplace/products/[id]/variants/route.ts:73-78,116,151` | POST/PUT/DELETE no verifica que `productId` pertenezca a `auth.tenantId`. Admin de tienda A muta variantes de tienda B |
| M4 | `app/api/marketplace/stores/[slug]/store-products/route.ts:12-22` | `assertStoreOwner` retorna OK si `auth.role === "admin"` SIN verificar tenantId. Cross-tenant write masivo en catálogo |

### 🌊 Fuga cross-tenant (Multi-tenant) — 5

| # | Archivo | Issue |
|---|---|---|
| MT1 | `lib/db/customers.db.ts:156` | `getByPhone(phone, tenantId?)` con tenantId **opcional**. Retorna customer del primer tenant que tenga el phone |
| MT2 | `lib/db/customers.db.ts:173-193` | `upsert` por `where:{phone}` sin tenantId — sobreescribe customer de OTRO tenant |
| MT3 | `app/api/auth/otp/verify/route.ts:122` | `CustomersDB.getByPhone(phone)` sin tenantId — OTP de un tenant valida customer de otro |
| MT4 | `lib/agents/domains/customers.agent.ts:288` | Agente IA con `getByPhone(phone)` sin tenantId — responde con datos cross-tenant |
| MT5 | `lib/middleware/tenant.ts:62-64` | `custom--{host}` synthetic NO valida `Tenant.customDomain` en DB. Vector phishing DNS |

### 🛡️ Tenants suspendidos siguen vendiendo — 2

| # | Archivo | Issue |
|---|---|---|
| M5 | `app/api/marketplace/catalog/route.ts:128-136` y `search/route.ts:169-172` | NO validan `tenant.active` ni trial expirado. Vendor sin plan sigue cobrando |
| M6 | `app/api/marketplace/products/check-exists/route.ts:43-52` | Permite enumerar productos de tiendas suspendidas + carrito hidrata productos de tenants inactivos |

### 🔒 Superadmin — 2

| # | Archivo | Issue |
|---|---|---|
| SA1 | `lib/session.ts:165,201` | `getSessionPayload`/`getRefreshPayload` excluyen `"superadmin"` del allowlist. Bug latente: refactor futuro emitiendo token con role superadmin → invalidado silente |
| SA2 | `app/api/superadmin/platform-config/upload/route.ts:34` | POST upload imágenes (logo/favicon/QR Yape) SIN guard en handler — solo middleware de edge. Bypass = upload anónimo a bucket Supabase |

### 👁️ Visual UX — 3

| # | Ruta | Issue |
|---|---|---|
| V1 | `/marketplace/main` dark/desktop | Tour onboarding bloquea hero + catálogo en first-visit |
| V2 | `/marketplace/main` todos | Banner imagen falla → muestra texto alt `"Banner de Buleje"`. Sin fallback skeleton |
| V3 | `/t/main` todos | Storefront muestra `"Bodega Buleje Test"` (nombre interno) en lugar de `storeTheme.storeName`. Tienda parece fantasma |

---

## P1 (26) — alto impacto

**Marketplace (7):** sponsored ranker no valida tenant activo · stock global compartido cross-vendor · `notifyOwner` slug↔CUID bug · syncInventory auto-create stores en tenants suspendidos · `ensureTenant` auto-crea tenants ghost · checkout marketplace sin auth/captcha (spam WhatsApp) · Customer upsert race con phone @unique global

**Multi-tenant (5):** `customers/[phone]` argumentos invertidos en route · plan-gating en solo 4/89 admin endpoints (203 sin) · 5 endpoints admin con prisma directo · `proxy.ts` solo loggea tenant_header_mismatch (no bloquea) · `lib/require-admin` fallback a `"main"` si JWT corrupto

**Security (4):** `EmployeeInvitations.markExpired` sin tenantId en WHERE · `LIMIT ${Number(limit)}` raw SQL interpolation (regla #11) · `ensureTenant` auto-create · `marketplace/stores PUT` sin tenantId en where (defensa profundidad)

**Superadmin (5):** delete tenant sin `logSuperadminAction` (Ley 29733) · reset-password sin audit log · extend-trial solo runtime log · 41 archivos con prisma directo (regla #1) · IA banners/copy-suggest sin guard handler

**Visual (5):** iconos `h-3` en stats strip (regla h-4) · `text-gray-*` sin `dark:` en product cards `/t/` (WCAG AA falla) · hover inconsistente product cards · placeholders vacíos productos featured · `ChipButton` compact con `border` 1px

---

## Patrones positivos detectados (NO romper)

| Patrón | Por qué importa |
|---|---|
| `proxy.ts → resolveTenantMultiSource` (path > JWT > cookie > Referer) con HMAC verify | Fuente de verdad ordenada y resistente a forgery |
| `app/admin/layout.tsx:21-53` script blocking pre-hidratación que limpia localStorage cross-tenant | Cierra clase entera de fugas client-side durante impersonación |
| 88/89 endpoints admin con `requireAdmin` | Cobertura RBAC casi total |
| HMAC-SHA256 sessions + `jti` revocation + 15min access + 7d refresh | Auth bypass no detectado |
| CSRF double-submit en `lib/csrf.ts` + `csrfHeaders()` cliente | 0 hallazgos CSRF |
| `productOwner.tenantId` derivado en badges/reviews/recommendations (no del header) | IDOR cerrado |
| Phone-mask `***${phone.slice(-4)}` + `redactPII` en logs | Cumplimiento Ley 29733 |
| MP webhook signature + `tenantId` derivado de `storeSlug → store.tenantId` | Webhook no confía payload externo |
| Magic-bytes validation en `payment-proof` (no Content-Type) | File upload seguro |

---

## Plan de remediación sugerido (3 sprints)

### Sprint 13 — Cross-tenant críticos (8h)
1. **Customers.getByPhone tenantId requerido** (MT1, MT2, MT3, MT4): refactor signature + 4 callers + compound unique migration
2. **Custom domain DB validation** (MT5): `tenant.findFirst({customDomain: host})` antes de mintear synthetic
3. **Marketplace cross-tenant write** (M3, M4): `assertStoreOwner` siempre compara tenantId; variants verify productOwner

### Sprint 14 — Marketplace dinero (12h)
4. **MP multi-vendor preferences** (M1): 1 preference por tienda o Marketplace MP API nativo
5. **Hook commissions on entregado** (M2): llamar `recordMarketplaceCommissions` + mover a `cleared`
6. **Filtro tenant.active en catálogo público** (M5, M6): aplicar a `catalog`, `search`, `check-exists`, `sponsored-ranker`

### Sprint 15 — Hardening (8h)
7. **Superadmin handler guards** (SA2): `requirePlatformAPI` defense-in-depth en upload/banners/payment-proofs
8. **Audit log Ley 29733** (P1 superadmin): `logSuperadminAction` en delete/reset-password/extend-trial
9. **EmployeeInvitations tenantId** (P1 security): `markExpired` + raw SQL parametrizado
10. **Plan-gating expandido**: aplicar `requireActiveSubscription` a 40 endpoints CRÍTICOS del reporte billing

### Sprint 16 — Visual + UX (4h)
11. **Visual P0** (V1, V2, V3): tour key bypass + banner fallback + storeName configurable
12. **Visual P1** (5): iconos h-4, tokens DS, hover, border-2

**Total estimado: 32h (~1 semana dev senior).**

---

## Recomendación arquitectural

**ADR-082 candidato: Postgres RLS como defense-in-depth.**
La arquitectura app-level es correcta y consistente, pero los huecos detectados (MT1-MT5) son **bugs de uso** — caller olvida pasar `tenantId`. RLS no reemplaza el patrón actual; lo refuerza: si cualquier caller olvida tenantId, la DB bloquea. Dado el tamaño (160 modelos × 90 DB classes × 226 endpoints = superficie de error grande), ROI alto.

Alternativa más liviana: **lint custom** que prohíba `tenantId?:` opcional en firmas de DB classes (regla automatizada).
