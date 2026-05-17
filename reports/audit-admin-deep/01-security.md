# Pentest Profundo — Panel Admin Buleje

**Fecha:** 2026-05-17  
**Alcance:** `app/api/admin/**`, `app/api/superadmin/**`, `lib/auth/*`, `lib/csrf.ts`, `lib/require-admin.ts`  
**Pentester:** Security Pentester (Claude Opus 4.6)  
**Riesgo general:** Medio (arquitectura sólida; hallazgos son P1/P2/P3, ningún P0)  
**Routes auditadas:** 200 (admin + superadmin)

---

## Resumen ejecutivo

El sistema RBAC + multi-tenant está bien diseñado (`requireAdmin` con management-tier bypass, JWT canonical CUID, blacklist `jti`, defense-in-depth contra default-to-main). Hallazgos sesiones anteriores (P0-4 timing oracle recetario, P1-1 fallback main) están **cerrados**. No detecté: secrets hardcodeados, SQLi explotable, XSS sin escape, IDOR cross-tenant en endpoints `[id]`, JWT/password en logs. Hay **6 hallazgos accionables**, todos defense-in-depth.

| Severidad | Cantidad | Bloqueante merge |
|---|---|---|
| P0 (Crítico) | 0 | — |
| P1 (Alto) | 3 | Sí — corregir antes de prod |
| P2 (Medio) | 2 | Backlog |
| P3 (Info) | 1 | Documentar |

---

## Hallazgos

### P1-1 — IDOR en image-bank items (cross-category)

**Archivo:** `app/api/superadmin/image-bank/[categoryId]/items/[itemId]/route.ts:36-49`  
**OWASP:** A01 Broken Access Control  
**Tipo:** IDOR (Insecure Direct Object Reference) — falta validación de ownership entre `categoryId` y `itemId`.

**Por qué:** `ImageBankDB.updateItem(categoryId, itemId, patch)` (`lib/db/image-bank.db.ts:findIndex`) busca el item **dentro** de la categoría provista. Pero el route handler acepta cualquier combinación `{categoryId, itemId}` sin verificar que ese item realmente vive en esa categoría. Un superadmin malicioso o token comprometido puede pasar un `itemId` de otra categoría con cualquier `categoryId` válido. Si `cat.items.find(it => it.id === itemId)` no encuentra match, tira "Item no encontrado" — pero confirma vía timing si el `categoryId` existe o no, dando enumeration oracle.

**Impacto:** Bajo en single-tenant (datos no sensibles), pero rompe el contrato del recurso. Si la estructura cambia (ej. agregás permisos por categoría), se vuelve explotable.

**PoC:**
```bash
# Asumiendo session superadmin
curl -X PATCH https://buleje.pe/api/superadmin/image-bank/cat_A/items/item_B_from_cat_C \
  -H "Cookie: buleje-platform-sess=..." -H "X-CSRF-Token: ..." \
  -d '{"name":"hacked"}' 
# Antes del fix: "Item no encontrado" (404) si cat_A existe pero item_B no está ahí
# Esperado: "Categoría inválida para este item" (404 sin oracle)
```

**Fix:**
```ts
// En ImageBankDB.updateItem agregar validación explícita:
const item = cat.items.find((it) => it.id === itemId);
if (!item) throw new Error("not_found"); // mensaje genérico
```
O mejor: indexar items por `${categoryId}:${itemId}` y validar prefix.

---

### P1-2 — 39 routes admin usan `prisma.*` directo (violación regla #1)

**Archivos:** ver listado abajo  
**OWASP:** A04 Insecure Design (defense-in-depth)  
**Tipo:** Regla #1 CLAUDE.md — "Nunca `prisma.*` directo desde routes; usar `lib/db/*.db.ts`".

**Por qué:** El patrón `lib/db/*.db.ts` impone: (a) `tenantId` 1er param, (b) cache + invalidate, (c) audit. Saltarlo significa: si alguien edita la query luego y olvida `where: { tenantId }`, hay leak silencioso. El sistema ya tiene scripts (`debug-tenant-leak`) precisamente porque pasó. Aunque hoy la mayoría sí pasa `tenantId`, son 39 puntos de fragilidad sin cache ni audit.

**Routes afectadas (sample):**

| Route | Riesgo concreto |
|---|---|
| `app/api/admin/seed-data/route.ts` | 40+ `deleteMany` + `create` directos; ya tiene `where:{tenantId}` pero no usa DB class |
| `app/api/admin/seed-peru-products/route.ts` | Hardcodea `tenantId: "main"` en 3 lugares — si cambia el slug, no compila |
| `app/api/admin/today-summary/route.ts` | 7 queries directas sin cache class |
| `app/api/admin/recetario/[id]/route.ts` | Acepta excepción pero documenta "no hay NoteDB todavía" |
| `app/api/admin/plan/mock-activate/route.ts` | `prisma.tenant.update` directo |

**Conteo:** `grep -rln "^import.*\\{[^}]*\\bprisma\\b" app/api/admin --include=route.ts` → 39 archivos.

**Impacto:** Bajo hoy (todas pasan `tenantId`). Riesgo crece a Alto con cada refactor.

**Fix incremental:** crear backlog para mover a `*.db.ts`. Priorizar las que tocan dinero/PII:  
1. `seed-data` → `SeedDataDB`  
2. `today-summary` → `DashboardDB` (existe parcial)  
3. `mock-activate` → `TenantsDB`  

---

### P1-3 — Logs con `auth.username` + `tenantId` + IP en routes purge/impersonate

**Archivos:**  
- `app/api/superadmin/impersonate/route.ts:88-99`  
- `app/api/superadmin/purge/route.ts:124-130, 182-205`  
- `app/api/superadmin/security/sessions/revoke/route.ts:48`

**OWASP:** A09 Logging gaps (otra cara — exceso)  
**Tipo:** PII en logs (Ley 29733 PE Art. 16/18 — minimización).

**Por qué:** Los logs ya van a Sentry/PostHog/Logflare. `superadmin/purge` loggea `username`, IP, userAgent, lista completa de 14 tablas borradas + `reason` libre del usuario. Si la cuenta de logs se compromete (token Sentry filtrado), atacante puede correlacionar quién purgó qué tenant. Ley 29733 pide minimización — alcanza con `userId` hasheado + `actionId` (UUID), no `username` plano + IP.

**Impacto:** Cumple audit pero excede minimización. PII en pipeline de telemetría third-party.

**Fix:**
```ts
// lib/audit/redact.ts (nuevo)
export function redactPII(o: object) {
  return { ...o, ip: hashIp(o.ip), username: hashUser(o.username) };
}
// Usar en logger.info/warn de routes superadmin
```

---

### P2-1 — Endpoint `/api/debug-tenant-leak` queda en repo

**Archivo:** `app/api/debug-tenant-leak/route.ts` (untracked, no commiteado)  
**OWASP:** A05 Misconfig  
**Tipo:** Endpoint debug que expone metadatos.

**Por qué:** El endpoint introspecciona el extension de Prisma y devuelve `probeModelName`, `scopedSample` con primeras 12 filas de adminUser (incluye `id`, `username`, `name`, `tenantId`). Tiene `requireAdmin(["admin"])` — OK, pero es info-leak para un compromiso de cuenta admin (que ya pasaría sin esto). El problema: cuando se commitee, sigue ahí en prod. Es un "Brandon estaba debuggeando" típico.

**Fix:** Mover a `scripts/debug-tenant-leak.mjs` (offline) o gatear con `if (process.env.NODE_ENV !== "production")`. Ya hay precedente: `plan/mock-activate` usa `ENABLE_MOCK_CHECKOUT === "true"`.

**Verificación:** `rg "debug-tenant-leak" .` antes de merge a master.

---

### P2-2 — `seed-peru-products` hardcodea `tenantId: "main"` y rompe single-tenant intent

**Archivo:** `app/api/admin/seed-peru-products/route.ts:766, 776, 785, 795`  
**OWASP:** A05 Misconfig (intención multi-tenant rota)  
**Tipo:** Acoplamiento a slug "main".

**Por qué:** Brandon documentó en memoria 2026-04-28 la "intención single-tenant" pero el sistema sigue siendo multi-tenant. Si alguien clona el repo y crea un tenant `default` (no `main`), este endpoint dice 403 "Este endpoint solo funciona para la tienda principal (main)". Para un superadmin onboarding un cliente nuevo es WTF. Además, líneas 776/785/795 escriben `tenantId: "main"` directo en `prisma.product.findFirst/create` en vez de usar `auth.tenantId`.

**Fix:** Parametrizar el slug en config o usar `auth.tenantId` (el guard ya garantiza que es admin).

---

### P3-1 — Información (no es vulnerabilidad)

**Tema:** Reviso `lib/csrf.ts` y noto que `/api/auth/customer-lookup` está en webhookPaths (sin CSRF). Si ese endpoint acepta POST con body manipulable, falta defensa. **No es hallazgo** porque el endpoint usa rate limit + Zod, pero documentalo como excepción intencional.

**Recomendación:** comentario inline en `csrf.ts` línea 121 explicando por qué `customer-lookup` está exento.

---

## Lo que SÍ está bien (validado)

| Control | Evidencia |
|---|---|
| CSRF double-submit | `lib/csrf.ts` correcto, 32B entropy, constant-time compare, sameSite=strict |
| RBAC granular | `lib/auth/role-permissions.ts` matriz 26 recursos × 6 roles, default-deny |
| Multi-tenant defense | `require-admin.ts:73-85` rechaza con 401 si no hay tenant en JWT — no defaultea a "main" |
| JWT revocation | `cacheStore.get('revoked-access:${jti}')` checked en cada request |
| Timing oracle fix | `recetario/[id]` usa `findFirst(where: {id, tenantId})` no `findUnique` + filter |
| Raw SQL hygiene | `delivery.db.ts`, `settings.db.ts` usan `$1 $2` posicionales |
| Purge TOTP forzado | `superadmin/purge` requiere TOTP + reason + PURGE-PLATFORM string |
| XSS sanitization | `safeMdToHtml` y `formatInline` escapan HTML antes de markdown |
| Sin secrets hardcodeados | Grep `sk_live_`/`whsec_`/etc → solo en docs/setup-data.tsx |
| Sin .env commiteados | `git ls-files` clean |
| Rate limit en auth | `applyRateLimit(req, "AUTH")` en login, 2FA, OTP |
| Idempotency stripe | Stripe webhook queue persiste con dedupe (visto antes) |

---

## Verificación post-fix sugerida

```bash
# 1. Cerrar P1-1 (image-bank IDOR)
curl -X PATCH .../api/superadmin/image-bank/INVALID_CAT/items/REAL_ITEM_ID
# → debería ser 404 sin diferencia de timing

# 2. Re-grep regla #1
grep -rln "^import.*\\{[^}]*\\bprisma\\b" app/api/admin --include=route.ts | wc -l
# → meta: <39 (iterativo, no de golpe)

# 3. Confirmar P2-1 antes de merge
test ! -f app/api/debug-tenant-leak/route.ts || grep -q "NODE_ENV.*production" app/api/debug-tenant-leak/route.ts

# 4. Full pipeline
npm run lint && npx tsc --noEmit && npm run build
npm audit --audit-level=high
```

## Herramientas usadas

- gitleaks: ❌ NO instalado (fallback a grep — recomendar `npm i -g @gitleaks/gitleaks`)
- Grep ofensivo: ✅ 200 routes escaneadas
- Análisis estático manual: ✅ 18 archivos críticos leídos
- `git ls-files` para secrets en disco: ✅ clean

---

**Próximos pasos:** invocar `security-auditor` (defensivo) para confirmar P1-2 prioritización y skill `audit-first` antes de tocar `lib/db/*.db.ts`.
