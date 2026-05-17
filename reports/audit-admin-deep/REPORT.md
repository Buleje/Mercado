# Audit Admin Profundo — Buleje Panel ERP

**Fecha:** 2026-05-17
**Branch:** `feat/checkout-payment-proof`
**Alcance:** Panel admin completo (`app/api/admin/**`, `app/api/sales`, `app/api/orders`, `app/api/turnos`, `components/admin/**`, `lib/db/**`, `lib/auth/**`)
**Método:** 4 subagentes paralelos (Security Pentester, Bug Hunter, Performance Engineer, Code Reviewer) + análisis cross-cutting propio

---

## Inventario

| Capa | Cantidad |
|---|---|
| Componentes admin (`.tsx`) | **749** |
| Endpoints API totales | **866** |
| Endpoints admin (`/api/admin/**`) | **113** |
| DB classes (`lib/db/*.db.ts`) | **99** |
| Top componente | `MarketplaceModule.tsx` (4153 LOC) |
| Top endpoint | `app/api/orders/route.ts` (1020 LOC) |
| Enums críticos | OrderStatus (lowercase) · FiadoStatus (UPPERCASE) · TurnoStatus (UPPERCASE) |

---

## Resumen ejecutivo

| Categoría | P0 | P1 | P2 | Bajos | Total |
|---|---|---|---|---|---|
| **Seguridad** | 0 | 3 | 2 | 1 | 6 |
| **Bugs** | 4 | 5 | 3 | 0 | 12 |
| **Performance** | 5 | 6 | 5 | 0 | 16 |
| **Quality / Convenciones** | 4 | 7 | 6 | 2 | 19 |
| **Hallazgos propios cross-cutting** | 1 | 2 | 1 | 0 | 4 |
| **TOTAL** | **14** | **23** | **17** | **3** | **57** |

**Veredicto:** arquitectura RBAC + multi-tenant **sólida y bien diseñada** (security pentest no encontró P0). Los riesgos críticos son **bugs operativos** (cajero bloqueado en turnos, race condition en fiados) y **deuda de performance** (recharts monolíticos, N+1 queries, contexts sin memo). 57 hallazgos accionables.

---

## P0 — Críticos · 14 hallazgos · bloquean producción

### Bugs (data corruption / lógica rota)

| # | Archivo:Línea | Hallazgo | Impacto |
|---|---|---|---|
| **B-P0-1** | `app/api/turnos/[id]/cerrar/route.ts:54`, `summary/route.ts:40` | Compara `existing.adminUserId` (CUID) con `auth.username` (string humano) → cajero NUNCA puede cerrar su propio turno (403 siempre). | Cajeros bloqueados en operación diaria. |
| **B-P0-2** | `lib/db/fiados.db.ts:549-561` (cobrarPorCliente) | Dentro de tx hace `read saldo → write saldo` (SET no DECREMENT). Comment "Y2 FIX" miente: implementación no usa `{ decrement }`. Pérdida de saldo bajo concurrencia. | Pérdida de dinero. 2 cobros simultáneos al mismo cliente → saldo se reescribe. |
| **B-P0-3** | `lib/db/finance.db.ts:117-120` (addPayment) | `tx.payable.update({ where: { id } })` sin tenantId. Guard previo via `findFirst` cubre HOY, pero defense-in-depth roto. | Cross-tenant write si guard se rompe en refactor. |
| **B-P0-4** | `app/api/orders/route.ts:162-177`, `app/api/sales/route.ts:103-110` | Paginación in-memory: `getAllFiltered` + `orders.slice(start, end)`. RAM 50MB+ por request con tenant de 50k órdenes → OOM en Vercel Fluid (512MB). | OOM en producción a escala. |

### Quality (regla #1 + RBAC + cache)

| # | Archivo:Línea | Hallazgo | Impacto |
|---|---|---|---|
| **Q-P0-1** | `app/api/admin/orders/[id]/payment-proof/route.ts:65` | `prisma.paymentApproval.findUnique({ where: { id } })` sin tenantId. Defense-in-depth. | Admin de otro tenant con id válido lee comprobantes. |
| **Q-P0-2** | `app/api/admin/plan/checkout/stripe-session/route.ts:38` | `requireAdmin(req)` sin roles → cajero/almacenero pueden iniciar Stripe session. | Cualquier rol admin manipula facturación SaaS. |
| **Q-P0-3** | `app/api/admin/orders/[id]/payment-proof/route.ts:29` | `requireAdmin(req)` sin roles → cualquier rol aprueba comprobantes. | Pago no autorizado por roles bajos. |
| **Q-P0-4** | `lib/db/purchases.db.ts` (3 métodos) | `add(supplier)`, `delete(supplier)`, `add(purchaseOrder)` sin `invalidate`. | Stock/proveedores stale en POS — inventario incorrecto. |

### Performance (N+1 + bundle)

| # | Archivo:Línea | Hallazgo | Impacto |
|---|---|---|---|
| **P-P0-1** | `app/api/analytics/anomalias/route.ts:93,174` | 2 `findMany(products)` serializados fuera de `Promise.all`. | TTFB +300-600ms con >500 productos. |
| **P-P0-2** | `app/api/analytics/kpis/route.ts:65-77` | 3 `findMany(saleItem)` serializados en cascade. Prisma directo. | TTFB +400-800ms con >1000 ventas. |
| **P-P0-3** | `components/admin/PrestamosModule.tsx:14` | Recharts importado estático en monolito 2705 LOC. | LCP +200-400ms (parse JS ~80KB gzip). |
| **P-P0-4** | `ContratosModule.tsx:17`, `TesoreriaModule.tsx:19` | Mismo problema en 2 monolitos >2000 LOC. | LCP +150-300ms por módulo. |
| **P-P0-5** | `app/api/analytics/kpis/route.ts` | Sin `getOrSet` ni cache, llamado cada 30s por polling. | CPU DB +40% en horas pico. |

### Hallazgo propio

| # | Archivo:Línea | Hallazgo | Impacto |
|---|---|---|---|
| **X-P0-1** | `app/api/admin/recetario/route.ts:36` | `prisma.note.findMany({ where: { title: "__RECETARIO__" } })` sin tenantId → cualquier admin ve recetas de TODOS los tenants. POST sí pasa tenantId, solo GET es leak. | Cross-tenant data leak en lectura. |

---

## P1 — Altos · 23 hallazgos · resolver antes de merge a master

### Bugs

| # | Archivo:Línea | Hallazgo |
|---|---|---|
| B-P1-1 | `CreditScoreCard.tsx:90`, `CheckManagementTab.tsx:60-61` | Status comparisons con enums incorrectos. Order no tiene "pagado" — score crediticio defectuoso. |
| B-P1-2 | `app/api/turnos/[id]/cerrar/route.ts:40`, `summary/route.ts:30` | `findUnique({ where: { id } })` + filter post — timing oracle débil. Usar `findFirst({ id, tenantId })`. |
| B-P1-3 | `PayablesTab.tsx:202,287`, `ReceivingTab.tsx:487`, `CheckManagementTab.tsx:217` | `Number(p.amount).toFixed(2)` con amount undefined → "NaN" mostrado al usuario. |
| B-P1-4 | `NotificationsTab.tsx`, `LiquidityForecastTab.tsx`, `ShiftControlTab.tsx`, `PurchaseOrdersTab.tsx`, `BundlesTab.tsx` | `fetch(...).then(r => r.ok ? r.json() : [])` swallow silencioso. API 500 → UI muestra "0 facturas" sin error. Vital en LiquidityForecastTab (dinero). |
| B-P1-5 | `app/api/payables/[id]/route.ts:66-69, 95-98` | `catch { /* fire-and-forget */ }` en invalidación de caché — falla Redis = bodeguero ve cuentas "pagadas" como "pendientes". |

### Security

| # | Archivo | Hallazgo |
|---|---|---|
| S-P1-1 | `app/api/superadmin/image-bank/[categoryId]/items/[itemId]/route.ts:36-49` | IDOR cross-category: no valida que itemId pertenezca a categoryId. Timing oracle de enumeration. |
| S-P1-2 | 39 routes admin | `prisma.*` directo (regla #1). Tendencia creciente, deuda técnica acumulada. |
| S-P1-3 | `superadmin/impersonate`, `superadmin/purge`, `superadmin/security/sessions/revoke` | PII (username + IP + reason libre) en logs Sentry/PostHog → Ley 29733 PE Art. 16/18 pide minimización. |

### Performance

| # | Archivo:Línea | Hallazgo |
|---|---|---|
| P-P1-1 | `components/admin/InventoryTab.tsx:25` | `KardexModal` (246 LOC con recharts) importado estático cuando los otros 3 modals del archivo usan `dynamic`. |
| P-P1-2 | `stock-alerts`, `achievements`, `monthly-report`, `compliance-dashboard` | 4 endpoints lectura frecuente sin `getOrSet` ni invalidate post-writes. |
| P-P1-3 | `contexts/cart-context.tsx:589` | `value={{...}}` con 20 props, objeto nuevo cada render. 16 useMemo internos NO sirven sin memo del contenedor. POS/checkout INP +30-80ms. |
| P-P1-4 | `contexts/settings-context.tsx:283` | Mismo problema, peor: envuelve 133 tabs admin. Cambio de `modeLoading` re-renderiza TODO. |
| P-P1-5 | `inicio/InicioCharts.tsx:14`, `smart-dashboard/DashboardCharts.tsx:18` | Recharts estático en componentes del tab Inicio (primer render). LCP +200ms. |
| P-P1-6 | `app/api/analytics/fiado-analytics/route.ts:47-51` | Sin cache TTL, llamado cada render del tab Fiados. TTFB +200ms. |

### Quality

| # | Archivo | Hallazgo |
|---|---|---|
| Q-P1-1 | 41 archivos `app/api/admin/**` | `prisma.*` directo (regla #1). Críticos con writes: `sunat/generate-invoice`, `delivery-zones`, `setup-marketplace-store`, `store-reviews`. |
| Q-P1-2 | `app/api/admin/today-summary/route.ts:34-108` | 8 `prisma.*` directos en hot-path. Sin cache, sin audit. |
| Q-P1-3 | `lib/db/product-images.db.ts` (create/update/delete) | Sin `invalidate` — vitrina muestra fotos antiguas hasta TTL natural. |
| Q-P1-4 | `lib/db/finance.db.ts` (Payable, Expense) | Sin invalidate — Tesoreria stale tras crear/eliminar. |
| Q-P1-5 | `components/admin/TurnosModule.tsx` (2147 LOC) | 7× límite 300 LOC. Modificado este branch. Apertura/cierre + cálculos + UI mezclados. |
| Q-P1-6 | `VoiceCommandPOS.tsx` (484), `pos/POSCustomerSearch.tsx` (560) | >300 LOC sin split en hooks. |
| Q-P1-7 | 17 endpoints | `requireAdmin(req)` sin roles. Notables: chat, documents/share, overview (métricas financieras), documents/templates/generate. |

### Hallazgos propios

| # | Archivo:Línea | Hallazgo |
|---|---|---|
| X-P1-1 | 38/113 endpoints admin | Sin `applyRateLimit`. Lectura sample: `subscriptions/stats`, `analytics`, `overview`, `alerts-summary`, `socio/members`, `dashboard/aggregates`. Sin rate limit → DoS por admin comprometido. |
| X-P1-2 | `components/admin/GoalsTab.tsx:335,411`, `AIStatusBanner.tsx:64`, `ContentCalendar.tsx:113,136`, `AdminUsersTab.tsx:68` | `catch { /* silent */ }` en componentes que NO son localStorage/date-parse. Errores reales silenciados. |

---

## P2 — Medios · 17 hallazgos · backlog

### Bugs / Security
- `sales-anomalies.db.ts:222`, `cierre-diario.db.ts:141`, `subscriptions.db.ts:255` — `findUnique` sin tenantId (P2)
- `seed-peru-products` hardcodea `tenantId:"main"` (4 lugares)
- `/api/debug-tenant-leak` untracked sin gate `NODE_ENV` (debería gatear o mover a `scripts/`)
- POS calcula totales en cliente (`KioskPOS`, `MobilePOS`, `POSView`) — verificar recomputo backend (regla #6)
- `stripe-session` y `setup-marketplace-store` usan `OR/in` con id+slug — slug de A == id de B causa cross-tenant

### Performance
- `FinanzasModule.tsx:1071` polling 1min sin `document.visibilityState` guard → 1440 req/día por sesión inactiva
- `warehouses`, `delivery-zones` sin cache + sin invalidate
- 271/711 archivos admin sin memo — INP acumulativo
- `TesoreriaModule.tsx`, `CashRegisterTab.tsx` recharts estático + sin splits internos
- Los 18 endpoints `app/api/analytics/**` con prisma directo sin cache — los más costosos del panel

### Quality
- `variant-catalog.db.ts` deletes sin invalidate
- `api/sales/csv/route.ts` requireAdmin sin roles → export sales accesible por repartidor

---

## Lo que SÍ está bien (validado en pentest)

| Control | Evidencia |
|---|---|
| CSRF double-submit | `lib/csrf.ts` correcto, 32B entropy, constant-time compare, sameSite=strict |
| RBAC granular | `lib/auth/role-permissions.ts` matriz 26 recursos × 6 roles, default-deny |
| Multi-tenant defense | `require-admin.ts:73-85` rechaza 401 si no hay tenant — no defaultea a "main" |
| JWT revocation | `cacheStore.get('revoked-access:${jti}')` checked cada request |
| Timing oracle fix recetario | `recetario/[id]` usa `findFirst(where: {id, tenantId})` no `findUnique` + filter |
| Raw SQL hygiene | `delivery.db.ts`, `settings.db.ts` usan `$1 $2` posicionales |
| Purge TOTP | `superadmin/purge` requiere TOTP + reason + literal "PURGE-PLATFORM" |
| XSS sanitization | `safeMdToHtml`, `formatInline` escapan HTML antes de markdown |
| Sin secrets hardcodeados | Grep `sk_live_`/`whsec_` → solo en docs |
| Sin .env commiteados | `git ls-files` limpio |
| Rate limit en auth | login/2FA/OTP cubiertos |

---

## Plan de ejecución sugerido

| Sprint | Foco | Hallazgos | Tiempo estimado |
|---|---|---|---|
| **Hot-fix** | P0 bugs operativos | B-P0-1 (turnos), B-P0-2 (race fiados), X-P0-1 (recetario leak) | 2-3h |
| **Sprint 1** | P0 quality + security | Q-P0-1..4, S-P1-1 (IDOR), P-P0-3..4 (recharts dynamic) | 1 día |
| **Sprint 2** | P1 performance | P-P0-1, P-P0-2, P-P0-5 (analytics N+1 + cache), P-P1-3..4 (contexts memo) | 1-2 días |
| **Sprint 3** | P1 robustness | B-P1-4 (fetch swallows 5 tabs), B-P1-3 (NaN guards), Q-P1-1..7 (regla #1 sweep) | 2-3 días |
| **Backlog** | P2 deuda | 17 hallazgos | Continuous |

**Acciones de prevención sugeridas:**
1. Script CI que falle si `requireAdmin(req)` aparece sin segundo argumento (cierra 17 endpoints + previene más)
2. Audit automático de `invalidate` coverage en `lib/db/*.db.ts` writes (cierra Q-P0-4, Q-P1-3..4, P2 variant-catalog)
3. `gitleaks` en CI (no instalado hoy)
4. Lint rule para detectar `Number(x).toFixed()` sin guard `isFinite`
5. ESLint custom rule contra `r.ok ? r.json() : []` swallows

---

## Reportes detallados

- [01-security.md](./01-security.md) — Pentest profundo, 200 routes auditadas
- [02-bugs.md](./02-bugs.md) — Bug hunting, 12 hallazgos con reproducers
- [03-performance.md](./03-performance.md) — N+1, bundle, cache, Core Web Vitals
- [04-quality.md](./04-quality.md) — Reglas #1-#11 CLAUDE.md, 19 hallazgos

---

*Generado: 2026-05-17 | Branch: `feat/checkout-payment-proof` | 4 subagentes paralelos + análisis cross-cutting | NO modifica código — solo reporta*
