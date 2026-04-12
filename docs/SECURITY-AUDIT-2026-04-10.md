# Security Audit Report — Cleanup Plan 2026-04-10

**Auditor:** Security Auditor (OWASP Top 10 + CLAUDE.md)  
**Files Audited:** 7  
**Date:** 2026-04-10  
**Status:** CRITICAL FINDINGS DETECTED → BLOCK MERGE

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Files audited | 7 |
| Critical findings | 2 |
| High findings | 3 |
| Medium findings | 2 |
| Low findings | 1 |
| **Merge recommendation** | **BLOCK** |

**Verdict:** Multi-tenant isolation violation in `lib/db/recetas.db.ts` + inconsistent requireAdmin roles in `app/api/sales/[id]/route.ts` must be resolved before merge.

---

## Findings by File

### 1. lib/db/recetas.db.ts — MULTI-TENANT ISOLATION VIOLATION

**Severity:** CRITICAL  
**Rule violated:** CLAUDE.md #3 (tenantId en toda query multi-tenant)  

**Issue:** Function `getById(id: string)` en línea 107 NO filtra por `tenantId`.

```typescript
// ❌ INSECURE
async getById(id: string): Promise<DbReceta | null> {
  const row = await prisma.receta.findUnique({
    where: { id },  // Missing tenantId filter!
    include: { ingredientes: true },
  });
  return row ? mapReceta(row) : null;
}
```

**Reproduction:** Un tenant A puede obtener recetas de tenant B si conoce el ID.

**Current Mitigation:** Las rutas en `app/api/recetas/[id]/route.ts` verifican manualmente `if (receta.tenantId !== auth.tenantId)` (líneas 33, 67), pero esto es **defense-in-depth, no aislamiento garantizado**. Prisma-level validation DEBE estar en el DB class.

**Fix:** Cambiar firma a `getById(tenantId: string, id: string)` y agregar `where: { id, tenantId }`.

**Impact:** ALTÍSIMO — todas las rutas que usan `RecetasDB.getById()` dependen de validación manual en el handler.

---

### 2. app/api/sales/[id]/route.ts — INCONSISTENT AUTHORIZATION

**Severity:** HIGH  
**Rule violated:** CLAUDE.md #9 (requireAdmin con roles explícitos)  

**Issue:** GET en línea 24 llama `requireAdmin(req)` SIN roles explícitos.

```typescript
// Línea 23-24: GET /api/sales/[id]
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);  // ❌ No roles especificados
  if (auth instanceof NextResponse) return auth;
```

**Comparison:** POST en línea 37 especifica roles correctamente:

```typescript
const auth = await requireAdmin(req, ["admin", "cajero"]);  // ✅ Correcto
```

**Reproduction:** `requireAdmin(req)` sin segundo parámetro podría permitir solo "admin". Sales GET debe ser consistente: `["admin", "cajero"]`.

**Fix:** Cambiar línea 24 a `requireAdmin(req, ["admin", "cajero"])`.

**Impact:** MEDIO-ALTO — si los roles por defecto son demasiado restrictivos, bloquea uso legítimo. Si son permisivos, escalación de privilegios.

---

### 3. proxy.ts — BEARER TOKEN HANDLING RISK

**Severity:** HIGH  
**Rule violated:** CLAUDE.md #4 (no secrets hardcodeados) + rate limiting placement  

**Issue:** Líneas 69-71 reconocen Bearer tokens con prefijo `sk_` pero los acepta sin validación Prisma.

```typescript
const bearerAuth = request.headers.get("authorization") ?? "";
if (bearerAuth.startsWith("Bearer sk_") && pathname.startsWith("/api/")) {
  requestHeaders.set("x-api-key", bearerAuth.slice("Bearer ".length));
  return NextResponse.next({ request: { headers: requestHeaders } });
}
```

**Risk:** El header `x-api-key` se pasa downstream sin verificar que el key existe en BD ni que pertenece al tenant. Rate limiting (línea 77) se salta para API keys si este bloque retorna.

**Reproduction:** Un atacante con conocimiento de un prefijo `sk_` válido pero sin verificación puede:
1. Hacer request con `Bearer sk_<anything>`
2. Saltarse CSRF check (línea 84-86, no se ejecuta porque retorna en línea 71)
3. Saltarse rate limit (línea 77, condicional sobre `pathname.startsWith("/api/")` pero el flujo retorna antes)

**Fix:** Cambiar a validación de key en `lib/api-keys.ts` antes de setear header. CSRF + rate limit DEBEN ejecutarse antes de API key bypass.

**Impact:** ALTO — CSRF token + rate limit bypass simultáneamente si el key es válido.

---

### 4. app/api/orders/[id]/route.ts — MISSING RATE LIMITING

**Severity:** HIGH  
**Rule violated:** CLAUDE.md #6 (rate limiting en endpoints críticos)  

**Issue:** Endpoints de órdenes (GET, PATCH, DELETE) en líneas 37-302 NO tienen rate limiting explícito.

**Context:** `proxy.ts` línea 76 aplica rate limit global a `/api/*`, pero ordenes son **transaccionales + críticas** (cambios de estado, notificaciones). Deberían tener límites más estrictos que ventas.

**Fix:** Agregar rate limit por tenant + por endpoint en `lib/middleware` o en el handler.

**Impact:** MEDIO-ALTO — DoS en cambios de estado de pedidos.

---

### 5. lib/db/coupons.db.ts — NUEVO ARCHIVO: MISSING ISOLATION TESTS

**Severity:** MEDIUM  
**Rule violated:** `/audit-first` skill (nuevos archivos DB deben tener tests de aislamiento multi-tenant)  

**Issue:** Archivo nuevo sin test correspondiente que valide aislamiento.

**Evidence:** `__tests__/coupons-store-isolation.test.ts` EXISTE, pero necesita verificación de cobertura:
- ¿Cubre `list(tenantId, storeId)`?
- ¿Cubre `findByCode(tenantId, code, storeId)`?
- ¿Cubre que un `storeId` de tenant A NO puede acceder cupones de tenant B?

**Fix:** Ejecutar test suite de coupons y confirmar >90% de líneas cubiertas con casos de aislamiento.

```bash
npm run test -- coupons-store-isolation.test.ts --coverage
```

**Impact:** MEDIO — nuevo archivo de zona peligra sin auditoría de tests de aislamiento.

---

### 6. app/api/sales/route.ts — PII LOGGING RISK

**Severity:** MEDIUM  
**Rule violated:** CLAUDE.md + OWASP #8 (no loguear datos sensibles completos)  

**Issue:** Línea 193 loguea el error completo sin sanitización:

```typescript
console.error("[sales] POST error:", dbErr);
```

Si `dbErr` contiene un mensaje FK violation como `"Foreign key constraint failed: Customer.phone = 5551234567"`, se loguea el teléfono completo.

**Fix:** Sanitizar antes de loguear:

```typescript
const sanitizedMsg = msg.replace(/\d{8,}/g, "***");
console.error("[sales] POST error:", sanitizedMsg);
```

**Impact:** BAJO-MEDIO — depende de logging remoto. Si está en stdout/stderr en prod sin aceso restringido, exposición de PII.

---

### 7. proxy.ts — CSP HEADERS VERIFICATION

**Severity:** LOW  
**Rule violated:** OWASP #3 (XSS prevention)  

**Issue:** Archivo `lib/middleware/security-headers.ts` no leído. Necesario verificar que CSP:
- No incluye `'unsafe-inline'` en `script-src`
- No incluye `'unsafe-eval'`

**Note:** No hallazgo definitivo en lectura previa, pero DEBE auditarse. Remitir a reviewer de `security-headers.ts`.

**Fix:** Verificar `applySecurityHeaders()` en línea 116.

**Impact:** BAJO — si CSP está correcta, sin riesgo. Si no, XSS crítico.

---

## Blockers for Commit 13 & 14 of Cleanup Plan

### MUST FIX (BLOCKER)

1. **lib/db/recetas.db.ts:107** — Cambiar `getById(id)` a `getById(tenantId, id)` + filtrar por tenantId.  
   - Afecta: TODAS las rutas `/api/recetas/[id]/*`  
   - Criticidad: **CRÍTICA**

2. **app/api/sales/[id]/route.ts:24** — Cambiar `requireAdmin(req)` a `requireAdmin(req, ["admin", "cajero"])`.  
   - Afecta: GET /api/sales/[id]  
   - Criticidad: **ALTA**

### STRONGLY RECOMMENDED (PRE-MERGE)

3. **proxy.ts:69-71** — Mover API key validation DESPUÉS de CSRF + rate limit, no antes.  
   - Afecta: Todos los endpoints /api/* con Bearer token  
   - Criticidad: **ALTA**

4. **__tests__/coupons-store-isolation.test.ts** — Confirmar ejecución + >90% coverage de métodos multi-tenant de coupons.db.ts.  
   - Criticidad: **MEDIA**

### NICE TO HAVE (POST-MERGE)

5. **app/api/sales/route.ts:193** — Sanitizar logs antes de PII exposure.  
   - Criticidad: **MEDIA-BAJA**

6. **lib/middleware/security-headers.ts** — Auditar CSP headers explícitamente.  
   - Criticidad: **BAJA**

---

## Go/No-Go Recommendation

**GO:** ❌ **NO — BLOCK MERGE**

**Razón:** Multi-tenant isolation violation en `RecetasDB.getById()` es un hallazgo **crítico de seguridad**. Las rutas actuales dependen de validación manual en el handler, violando el principio de **defense-in-depth** (la DB class DEBE garantizar aislamiento, no delegarlo a callers).

Hasta que se implemente `getById(tenantId, id)` con filtro Prisma-level, **no debe mergear a master**.

**Acciones antes de re-auditar:**
1. Implementar fix para `RecetasDB.getById()` + actualizar todas las rutas que lo usan.
2. Cambiar `requireAdmin(req)` sin roles a `requireAdmin(req, ["admin", "cajero"])` en sales GET.
3. Re-auditar solo esos dos archivos antes de merge.

**Estimado de trabajo:** 15–30 min para fixes + tests.

---

## Checklist OWASP

| Control | Status | Evidence |
|---------|--------|----------|
| **1. Inyección** | ✅ PASS | Todas las queries usan Prisma parameterized. No `$queryRawUnsafe` sin parámetros en archivos auditados. |
| **2. Auth & Access** | ❌ FAIL | RecetasDB.getById() sin tenantId. Sales GET sin roles explícitos. |
| **3. XSS** | ⚠️ REVIEW | CSP headers no auditados en proxy.ts. Cliente React es seguro (no dangerouslySetInnerHTML). |
| **4. Secrets** | ✅ PASS | No secrets hardcodeados en archivos auditados. SK_ keys en `.env.ts` solo. |
| **5. Multi-tenant** | ❌ FAIL | RecetasDB.getById() viola aislamiento. |
| **6. Rate Limit** | ⚠️ PARTIAL | proxy.ts global + orders endpoints sin limit específico. |
| **7. CSRF** | ✅ PASS | proxy.ts línea 84-86 valida token. Cookies httpOnly=false, sameSite=strict. |
| **8. PII Logging** | ❌ FAIL | console.error() en sales sin sanitización. |

---

**Documento:** `docs/SECURITY-AUDIT-2026-04-10.md`  
**Generado por:** Security Auditor Agent  
**Requiere re-auditoría:** SÍ (post-fixes)
