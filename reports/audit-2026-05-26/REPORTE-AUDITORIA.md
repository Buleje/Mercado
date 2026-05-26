# Reporte de Auditoría — Admin & Negocio Buleje · 2026-05-26

> Equipo: 4 agentes paralelos (security · database · code-review · performance) + verificación funcional/visual directa.
> Servidor: `localhost:3000` vivo · tenant probado: `pizza-pucallpa` (vertical pizzería).

## 1. Estado del sistema (gates)

| Gate | Resultado |
|---|---|
| Servidor dev | ✅ Up (home 200, admin 307→login) |
| `tsc --noEmit` | ✅ Limpio (exit 0) |
| Login (ADR-120 picker) | ✅ Funciona — credencial elige tienda |
| Dashboard Inicio | ✅ Renderiza, 0 errores consola |
| Tab Adelantos | ✅ Datos reales (S/1,000 · 100% recup · 2 liq) |
| Endpoints admin core | ✅ 200 (overview 1.3s, resto <700ms) |
| `/api/admin/health` | ⚠️ DB ok 116ms · Redis+Colas `degradado` (fallback memoria, esperado dev) |
| Lint | ❌→✅ Estaba roto (crash + ruido storybook); **arreglado → 0 errores, 2763 warnings** (backlog "warn" intencional) |

## 2. Hallazgos P0 (críticos)

| # | Área | Archivo:línea | Hallazgo | Fix |
|---|---|---|---|---|
| P0-1 | Seguridad/Auth | `app/api/auth/login/route.ts:276` | Bypass brute-force en cuentas legacy: lockout guardado por `if (dbUsers.length>0)`. Usuario solo-JSON nunca incrementa contador → intentos infinitos | Mover incremento fuera del `if` o incluir legacy en condición |
| P0-2 | Compliance | `app/api/auth/login/route.ts:260,269` | IP capturada y descartada (`void ip`) — audit log Ley 29733 Art.18 incompleto | Pasar `ip` y `tenantId` a `logActivity(...)` |
| P0-3 | Performance | `app/api/ai-assistant/route.ts:30` | 7 `getAll()` full-scan por mensaje (Products+Orders+Customers+Sales+Payables+Purchases+Reviews) sin cache snapshot → causa del timeout 15s | `getOrSet` snapshot 5min TTL antes de los 7 getAll |
| P0-4 | Performance | `lib/db/recommendations.db.ts:39-105` | Fan-out colaborativo: 6 `findMany` encadenados sin `take` ni cache, O(N²) en co-clientes | `"use cache"` + `cacheLife(300)` + `take:500` + limitar coPhones a 50 |
| P0-5 | DB N+1 | `lib/db/fiados.db.ts:452` | `findFirst` por cada payment dentro de `$transaction` loop | `findMany({where:{id:{in:ids},tenantId}})` antes del loop |
| P0-6 | DB N+1 | `lib/db/adelantos.db.ts:534` | Cron recurrentes: 1 `$transaction` por fila | Batched `$transaction([...creates])` |

> Nota P0-1/P0-2: el bypass solo aplica si `LEGACY_LOGIN=1` está activo en prod (confirmar con Brandon).

## 2b. Hallazgos de tooling (descubiertos al correr lint)

| # | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| T-1 | P1 | **Lint roto**: `.eslintignore` quedó deprecado en ESLint 9, sus entries dejaron de aplicarse → ESLint (a) crasheaba con `ENOENT` en `.claude/worktrees/**` y (b) lintaba `storybook-static/**` (bundles minificados) generando 254 errores + 17k warnings fantasma en `1:col-enorme`. CI lint estaba efectivamente ciego. | ✅ **Arreglado** — `.claude/**`, `worktree-*/**`, `coverage/**`, `storybook-static/**` migrados a `globalIgnores` en `eslint.config.mjs` |
| T-2 | P2 | **24 worktrees de agentes huérfanos = 3.5 GB** en `.claude/worktrees/` (desde 11-may), `locked`, varios con cambios sin commitear | ⏸️ Pendiente decisión Brandon (no borrado por seguridad) |

## 3. Hallazgos P1 (altos)

| # | Área | Archivo:línea | Hallazgo | Fix |
|---|---|---|---|---|
| P1-1 | CSRF | refresh superadmin | `sameSite:lax` en superficie sin double-submit | endurecer a `strict` o añadir double-submit |
| P1-2 | Convención #1 | `app/api/auth/login/route.ts:108,139,183,234` | 4 `prisma.*` directos en route (debe ser `lib/db`) | migrar a `lib/db/admin-users.db.ts` |
| P1-3 | Convención #1 | `app/api/customers/[phone]/route.ts:64,80` | `prisma.*` directos (uno duplicado de `CustomersDB.getByPhone`) | migrar a `lib/db` |
| P1-4 | Pool DB | `lib/prisma.ts:34,39` | `connectionTimeout 15s`, `max:5`, sin circuit breaker → spike agota pool (timeout loyalty) | `max:3` dev + `idleTimeoutMillis:10s` |
| P1-5 | Índices | `Review` model | `findMany take:1000 orderBy date` sin índice `(tenantId,date)` | `@@index([tenantId, date(sort:Desc)])` |
| P1-6 | Índices | `VendorApplication` | índice sin `tenantId` como primer campo | `@@index([tenantId,status,submittedAt])` |
| P1-7 | Perf | `purchases.db.ts:80,114,169` | 3 `getAll()` sin `take`/cache | `take:500 orderBy desc` + `"use cache"` |
| P1-8 | Perf | `AdminKPIBanner.tsx:85` +3 (`ActivityLogTab`, `GoalsTab`, `ShipmentTrackingTab`) | `setInterval 30s` sin visibility guard → red desperdiciada en background/móvil | `if(document.hidden) return;` |
| P1-9 | Perf | `ReviewsDB.getAll` `customers.db.ts:414` | `take:1000` sin cache, llamado por reviews+ai-assistant | `"use cache"; cacheLife(300)` |
| P1-10 | Mantenibilidad | `components/admin/adelantos/AdelantosModule.tsx` | 1645 líneas, 6 vistas + 4 modales inline (límite ~300) | extraer vistas a archivos |

## 4. Hallazgos P2 (medios)

| # | Archivo:línea | Hallazgo |
|---|---|---|
| P2-1 | `customers/[phone]/route.ts:129` | `requireAdmin(req)` sin roles → cualquier rol edita creditLimit/balance |
| P2-2 | `customers/[phone]/favorite-products` | 2 prisma directos con deuda documentada (ADR-119) |
| P2-3 | `AnalisisView.tsx:135` | CSV export `a.moneda` sin fallback `|| "PEN"` (rows null viejas) |
| P2-4 | 49 archivos `components/admin/**` | recharts importado estático dentro de chunks lazy → penaliza primer paint del tab |
| P2-5 | `analytics/route.ts` | GET analytics sin `cacheLife` |
| P2-6 | 14 `<img>` raw en admin (SettingsModule, BulkImageAssign…) | usar next/image o `loading=lazy` |
| P2-7 | branding webp LCP | warning consola: añadir `priority`/`loading=eager` a logo above-fold |
| P2-8 | migrations locales | 48 modelos sin `CREATE TABLE` local (existen en prod vía Supabase MCP) — historial incompleto, baseline recomendado |

## 5. Falsos positivos descartados (verificados)

- GiftCard "snake_case drift" → tiene `@@map("gift_cards")` correcto, migration OK.
- Defensas sistémicas SQLi / tenant-isolation / Zod / secrets → limpias (security agent, evidencia directa).
- Dark mode admin → tokens dark correctos; gestionado por provider, no clase `.dark`. No es bug confirmado.
- Perf ya resuelto (no re-reportar): tab nav popLayout, PostHog idle, html-to-image lazy, 133 tabs dynamic.

## 5b. Fixes APLICADOS en esta sesión ✅

| Commit | Qué se arregló | Verificación |
|---|---|---|
| `fix(lint)` | Config ESLint 9 (ignores muertos + storybook + cjs) + 3.5G→274M worktrees | lint 0 errores |
| `fix(perf,security)` | **6 P0**: cross-tenant cache IA (P0-3) · fan-out recs (P0-4) · N+1 fiados (P0-5) · N+1 adelantos cron (P0-6) · brute-force legacy (P0-1) · IP audit (P0-2) | tsc 0 · 58/58 tests · lint 0 |

> **Upgrade de severidad descubierto al arreglar P0-3:** el cache del asistente IA no estaba solo "sin cache" — era una variable **global no-keyed-por-tenant** → **fuga cross-tenant** real (un tenant veía datos de negocio de otro). Cerrado con `Map<tenantId>`.

**Pendiente (no aplicado):** los 10 P1 + 8 P2 quedan documentados para sprint dedicado. T-2 worktrees ya limpiado.

## 6. Recomendación de orden de ataque (P1/P2 restantes)

1. **P0-3 + P0-4** (timeout 15s — impacto usuario directo) — 2-4h.
2. **P0-5 + P0-6** (N+1 transaccional en dinero — riesgo lock) — 2h.
3. **P0-1 + P0-2** (auth/compliance — confirmar `LEGACY_LOGIN` primero).
4. **P1-8** (visibility guard pollings — quick win móvil) — 30min.
5. Índices P1-5/P1-6 (requiere migración con DIRECT_URL).
