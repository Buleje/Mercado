# TypeScript Errors — Baseline 2026-04-06 tarde

**Total:** 469 errores TS pre-existentes (vs ~620 estimados anteriormente — Agent Team sessions cerraron silenciosamente ~150).
**Comando:** `npx tsc --noEmit | grep -c "error TS"`
**Objetivo:** llegar a 0 antes de poder flipear `ignoreBuildErrors: true → false` en `next.config.ts` (TD-012).

---

## Distribución por código de error (top 7 = 92% del total)

| Código | Count | % | Significado | Dificultad |
|---|---:|---:|---|---|
| TS7006 | **152** | 32% | "Parameter X implicitly has 'any' type" | 🟢 Mecánico (agregar type) |
| TS2339 | 70 | 15% | "Property X does not exist on type Y" | 🟡 Mismatch de tipos |
| TS2345 | 65 | 14% | "Argument of type X not assignable to parameter Y" | 🟡 Mismatch de tipos |
| TS2304 | 53 | 11% | "Cannot find name 'X'" | 🟢 Import faltante |
| TS18048 | 38 | 8% | "X is possibly undefined" | 🟡 Null safety |
| TS2322 | 27 | 6% | "Type X is not assignable to type Y" | 🟡 Mismatch |
| TS2353 | 26 | 6% | "Object literal may only specify known properties" | 🟢 Typo en prop |
| (otros) | 38 | 8% | Long tail | Variado |

**Insight:** **205 errores (44%) son mecánicos** (TS7006 + TS2304 + TS2353). Una sesión de Agent Team con `frontend-engineer` debería poder cerrarlos en bloque.

---

## Distribución por archivo (top 20 = 66% del total)

| Archivo | Errores | Wave |
|---|---:|---|
| `components/admin/DashboardTab.tsx` | **48** | 1 |
| `components/admin/dashboard/DashboardVentasSection.tsx` | **42** | 1 |
| `components/admin/fiados/FiadoStats.tsx` | 30 | 2 |
| `components/admin/dashboard/DashboardInventarioSection.tsx` | 25 | 1 |
| `components/admin/dashboard/DashboardClientesSection.tsx` | 24 | 1 |
| `components/admin/fiados/FiadoModals.tsx` | 20 | 2 |
| `components/admin/DeclaracionInventarioModule.tsx` | 16 | 3 |
| `lib/agents/domains/inventory.agent.ts` | 11 | 3 |
| `lib/db/marketplace.db.ts` | 10 | 3 |
| `components/admin/dashboard/DashboardProductosSection.tsx` | 10 | 1 |
| `components/admin/dashboard/DashboardComprasCajaSection.tsx` | 10 | 1 |
| `components/admin/ai-center/AIActionPlan.tsx` | 10 | 3 |
| `components/admin/AuditLogTab.tsx` | 9 | 4 |
| `app/api/analytics/predictions/route.ts` | 9 | 3 |
| `components/admin/LoyaltyTab.tsx` | 8 | 4 |
| `components/admin/ExecutiveDashboardTab.tsx` | 8 | 1 |
| `app/api/marketplace/orders/route.ts` | 8 | 3 |
| `components/admin/fiados/FiadoFormModal.tsx` | 7 | 2 |
| `components/admin/EtiquetasTab.tsx` | 7 | 4 |
| `components/admin/DemandPredictionTab.tsx` | 7 | 4 |
| **Total top 20** | **309** | **66% del total** |

---

## Plan de oleadas para Sprint C

### Wave 1 — Dashboard family (167 errores, 36%)

**Archivos:** `DashboardTab.tsx`, `DashboardVentasSection.tsx`, `DashboardInventarioSection.tsx`, `DashboardClientesSection.tsx`, `DashboardProductosSection.tsx`, `DashboardComprasCajaSection.tsx`, `ExecutiveDashboardTab.tsx`.

**Hipótesis:** mismo patrón de error en todos — probablemente datos de charts mal tipados, o reads de Prisma con campos opcionales sin guard.

**Estrategia:** despachar `frontend-engineer` con instrucción "fix all TS errors in these 7 files, share patterns across them, batch-update similar fixes". Probable cierre: 90% en una sesión.

**Estimado:** 1 sesión Agent Team. **Score Δ:** -167 errores → 302 restantes.

### Wave 2 — Fiados cluster (57 errores, 12%)

**Archivos:** `FiadoStats.tsx`, `FiadoModals.tsx`, `FiadoFormModal.tsx`.

**Hipótesis:** lib/db/fiados.db.ts ya tiene `toNum()` para Decimal — los componentes probablemente usan Decimal directo donde esperan number.

**Estimado:** 0.5 sesión. **Score Δ:** -57 → 245 restantes.

### Wave 3 — Backend + agents (~48 errores, 10%)

**Archivos:** `inventory.agent.ts`, `marketplace.db.ts`, `analytics/predictions/route.ts`, `marketplace/orders/route.ts`, `AIActionPlan.tsx`, `DeclaracionInventarioModule.tsx`.

**Hipótesis:** mezcla de mismatches de tipos en boundary entre Prisma y API responses.

**Estrategia:** despachar `backend-platform-engineer`.

**Estimado:** 1 sesión. **Score Δ:** -48 → 197 restantes.

### Wave 4 — Long tail (~197 errores)

Archivos restantes (cada uno con <10 errores). Estrategia: barrido masivo con Agent Team paralelo (`qa-reliability` + `frontend-engineer` + `backend-platform-engineer`) por categoría de error TS, no por archivo.

**Estimado:** 2 sesiones. **Score Δ:** -197 → **0 errores**.

---

## Total estimado: 4-5 sesiones de Agent Team para llegar a 0

Después del 0:
1. Editar `next.config.ts` y cambiar `ignoreBuildErrors: true` → `false`
2. Correr `npm run build` para validar
3. Crear `docs/adr/008-typescript-strict-gate.md` documentando el cambio
4. Commit con mensaje `feat(types): enable strict TypeScript gate (closes TD-012)`
5. Push a master

A partir de ahí, **cualquier PR con error TS rebota en CI** — gate real por primera vez en la historia del proyecto.

---

## Comando de arranque para próxima sesión

```
/agent-team Sprint C: cerrar los 469 TS errors en oleadas según docs/ts-errors-baseline-2026-04-06.md.
Empezar por Wave 1 (Dashboard family, 167 errores en 7 archivos).
Después de cada wave, re-medir con `npx tsc --noEmit | grep -c "error TS"` y reportar el delta.
Target final: 0 errores. Después flipear ignoreBuildErrors=false y commit con ADR 008.
```
