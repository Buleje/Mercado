# Auditoría de Seguridad — Buleje (2026-05-25)

**Alcance:** OWASP Top 10, secrets, auth/RBAC, aislamiento multi-tenant, IDOR, CSRF, SSRF, raw SQL, validación Zod, endpoints sin auth.
**Método:** grep dirigido + lectura de contexto completo de cada hallazgo. Cada item tiene evidencia `archivo:línea`.
**Veredicto general:** Codebase MUY endurecido por auditorías previas (ver memoria sesiones 2026-05-06, -17, -19, -24). **0 hallazgos P0.** No se detectó SQLi, XSS explotable, auth bypass, tenant leak ni secrets expuestos en producción.

---

## Resumen por severidad

| Severidad | Cantidad |
|---|---|
| P0 (explotable ya) | 0 |
| P1 (riesgo real) | 0 |
| P2 (mejora defensiva) | 4 |
| A verificar | 1 |

---

## Tabla priorizada

| # | Sev | Vector | Archivo:línea | Estado | Fix |
|---|-----|--------|---------------|--------|-----|
| 1 | P2 | CSRF defense-in-depth | `lib/csrf.ts:103` + 12 endpoints superadmin mutación | Mitigado por SameSite=strict | Agregar `assertCsrf`/`validateSuperadminCsrf` a los 12 endpoints faltantes |
| 2 | P2 | Tenant isolation (defensa) | `lib/db/orders.db.ts:137,175` | No explotable (TS obliga tenantId) | `if (!opts.tenantId) throw` en vez de `if (opts?.tenantId)` |
| 3 | P2 | Timing-safe compare | `app/api/cron/smoke-invitations/route.ts:45` | Bajo riesgo | Usar `timingSafeCompare(authHeader, expected)` como los otros crons |
| 4 | P2 | Gitleaks no instalado | infra | — | `apt install gitleaks` + hook pre-commit (manual confirmó 0 env/keys trackeados) |
| 5 | verificar | Markdown→HTML del AI | `components/admin/AIAssistant.tsx:669`, `chat-ia/ChatIAClean.tsx:637` | Escapan HTML primero | Revisado: `escapeHtml` aplicado antes de regex markdown — OK. Confirmar que `moduleRegex` no reintroduce HTML sin escapar |

---

## Detalle de hallazgos

### #1 — P2: 12 mutaciones superadmin sin token CSRF app-level
**Evidencia:** `lib/csrf.ts:103` exime globalmente `/api/superadmin/*` del CSRF del proxy. De 56 endpoints superadmin con mutación, 16 no llaman ningún helper CSRF (`validateSuperadminCsrf`/`assertCsrf`/`validateCsrfToken`):
```
app/api/superadmin/settings/route.ts (POST)
app/api/superadmin/platform-config/route.ts (PATCH)
app/api/superadmin/payment-proofs/[id]/reject/route.ts (POST)
app/api/superadmin/vendor-applications/[id]/review/route.ts (POST)
app/api/superadmin/repartidores/route.ts
app/api/superadmin/vendor-identity/route.ts
app/api/superadmin/page-heroes/[id]/route.ts
app/api/superadmin/variant-catalog/[id]/options/route.ts
app/api/superadmin/roadmap/items/[itemId]/status/route.ts
app/api/superadmin/image-bank/[categoryId]/items/route.ts (+[itemId])
app/api/superadmin/activity/route.ts
... (auth/totp-enroll/totp-verify/impersonate-exit son exentos legítimos: pre-sesión)
```
**Por qué NO es P0/P1:** la cookie de sesión superadmin es `sameSite: "strict"` (`app/api/superadmin/auth/route.ts:15`). Un POST cross-site NO envía la cookie → la request llega sin sesión → 401. SameSite=strict es mitigación efectiva de CSRF. Los endpoints MÁS destructivos (delete/reset-password/extend-trial/purge) además ya usan `assertCsrf` explícito (belt-and-suspenders).
**Fix:** uniformar — agregar `validateSuperadminCsrf(req)` a los 12 endpoints de estado. Costo bajo, cierra la dependencia única en SameSite (defensa en profundidad). No bloquea merge.

### #2 — P2: `tenantId` opcional en where de orders.db
**Evidencia:** `lib/db/orders.db.ts:136-137` y `174-175`:
```ts
const where: Record<string, unknown> = {};
if (opts?.tenantId) where.tenantId = opts.tenantId;  // si falta → query SIN scope tenant
```
**Por qué NO es explotable:** la firma TS marca `tenantId: string` como **obligatorio**, y los ~12 callers verificados (`app/api/orders/route.ts`, crons, agents, backup) TODOS pasan `tenantId`. No hay ruta que lo omita.
**Fix:** convertir el guard defensivo en fail-closed: `if (!opts.tenantId) throw new Error("tenantId requerido")`. Evita que un futuro caller introduzca un leak silencioso. Regla #3 CLAUDE.md.

### #3 — P2: compare no timing-safe en cron smoke-invitations
**Evidencia:** `app/api/cron/smoke-invitations/route.ts:45`:
```ts
if (!process.env.CRON_SECRET || authHeader !== expected) { ... }
```
Los otros crons (`marketplace-sla-watchdog:50`, `superadmin-alerts:23`, `with-cron-health.ts:30`) usan `timingSafeCompare`. Este usa `!==` plano → side-channel de timing teórico sobre el CRON_SECRET.
**Fix:** `import { timingSafeCompare } from "@/lib/timing-safe"` y reemplazar el `!==`.

### #4 — P2: gitleaks ausente
**Evidencia:** `which gitleaks` → no instalado. Verificación manual: `git ls-files` no muestra `.env*` (excepto `.env.example` con placeholders), ni `.pem/.key/.p12`. Sin fallbacks de secrets crypto (`AUTH_SECRET || "literal"`, etc.). `lib/env.ts` valida en startup. Los únicos `||` son config no-secreta (FROM emails, SMTP host).
**Fix:** instalar gitleaks + correr en CI/pre-commit para defensa continua.

### #5 — verificar: render de markdown del AI
**Evidencia:** `dangerouslySetInnerHTML` en AIAssistant/ChatIAClean/PromotionsTab. Revisado: todos pasan por `escapeHtml` ANTES de aplicar regex markdown (`lib/safe-html.ts:18`, `AIAssistant.tsx:669`, `ChatIAClean.tsx:637`). JSON-LD usa `safeJsonLdStringify`/`safe()`. No se detectó sink sin escapar.
**A confirmar:** que `formatInline(..., moduleRegex)` no inserte HTML derivado de input de usuario tras el escape (el regex de módulos parece ser allowlist interna de nombres de tabs — bajo riesgo).

---

## Vectores auditados SIN hallazgos (mitigados o limpios)

| Vector | Evidencia de mitigación |
|--------|------------------------|
| **SQLi raw** | Todo `$queryRawUnsafe/$executeRawUnsafe` usa params posicionales `$1 $2`. Único `${}` es `TRUNCATE ${tableList}` en `purge/route.ts:274` donde `tableList` viene de constante `DATA_TABLES` (no input). |
| **Zod .parse()** | 0 usos de `.parse()` de Zod en producción — todo `safeParse`. |
| **XSS** | Sinks `dangerouslySetInnerHTML` usan `escapeHtml`/`safeJsonLdStringify`/tokens server-side. |
| **Auth/RBAC** | Endpoints sin auth = públicos legítimos (marketplace catálogo, tracking con token HMAC, store público). `proxy.ts` guarda `/api/superadmin/*` + CSRF global en mutaciones. |
| **IDOR** | `orders/[id]/tracking:41` valida ownership por teléfono normalizado + 404 único anti-enumeración. `public/tracking/[token]` usa token HMAC firmado 72h. `invitations/[token]` por token. |
| **Tenant leak** | `lib/db/*.db.ts` reciben `tenantId` 1er param; raw SQL de supplier/dashboard filtra `tenantId` en cada JOIN. |
| **SSRF** | `reverse-geocode` valida lat/lng como `z.coerce.number().min().max()` antes de interpolar en URL nominatim fija. OAuth/SUNAT/RENIEC usan URLs constantes de entorno. |
| **CSRF flujos públicos** | Webhooks (Stripe/MP/WhatsApp) validan HMAC/firma. Cron valida `CRON_SECRET` timing-safe. Login/OTP exentos justificados (pre-sesión). |
| **Secrets** | `lib/env.ts` valida startup; sin hardcoded; `.env.example` placeholders; nada trackeado. |
| **Cron auth** | `yape-reconciliation` usa `withCronHealth` (valida CRON_SECRET timing-safe, `with-cron-health.ts:30`). |
| **Login lockout** | Migrado de Map in-memory a cacheStore compartido (Redis) — `auth/route.ts:28`. |

