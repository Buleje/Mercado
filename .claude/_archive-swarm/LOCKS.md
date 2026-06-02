# LOCKS.md — Archivo de bloqueos por frente

> Cada frente declara aqui los archivos/directorios que va a tocar.
> **Regla dura: dos frentes NUNCA tocan el mismo archivo.**
> Si hay conflicto, el orchestrator reasigna.

---

## Como usar

1. Antes de empezar, el frente agrega sus archivos a su seccion
2. Si un archivo ya esta en otro frente → PARAR y avisar al orchestrator
3. Al terminar, marcar como `[done]`
4. El orchestrator limpia los locks al cerrar la ola

---

## Estado: Ola 2 ACTIVA (lanzada 2026-04-10 17:15)

### frente-back (worktree-1-roadmap-bugs)

| Archivo | Item | Estado |
|---------|------|--------|
| `prisma/schema.prisma` (campo Coupon.storeId) | #9 | pendiente |
| `lib/db/coupons.db.ts` | #9 | pendiente |
| `app/api/marketplace/coupons/route.ts` | #9 | pendiente |
| `app/api/finance/cashflow-rolling/route.ts` | #11 | pendiente (crear) |
| `lib/finance/cashflow-rolling.ts` | #11 | pendiente (crear) |
| `app/api/supplier/register/route.ts` | #15 | pendiente (crear) |
| `lib/db/supplier-signup.db.ts` | #15 | pendiente (crear) |

### frente-front (worktree-2-roadmap-features)

| Archivo | Item | Estado |
|---------|------|--------|
| `components/admin/unified/VendorDashboardModule.tsx` (toggle cupon) | #9 | pendiente |
| `components/admin/CashFlowRolling.tsx` | #11 | pendiente (crear) |
| `components/admin/RecetasModule.tsx` (costo real + produccion) | #13 | pendiente |
| `app/supplier/registrar/page.tsx` | #15 | pendiente (crear) |
| `components/supplier/SupplierSignupForm.tsx` | #15 | pendiente (crear) |

### frente-qa (worktree-3-roadmap-tier-a)

| Archivo | Item | Estado |
|---------|------|--------|
| `__tests__/coupons-store-isolation.test.ts` | #9 | pendiente (crear) |
| `__tests__/cashflow-rolling.test.ts` | #11 | pendiente (crear) |
| `__tests__/supplier-signup.test.ts` | #15 | pendiente (crear) |
| `__tests__/recetas-costo-real.test.ts` | #13 | pendiente (crear) |

---

## Archivos compartidos (SOLO orchestrator toca)

Estos archivos son cross-cutting y solo el orchestrator puede modificarlos:

| Archivo | Razon |
|---------|-------|
| `CLAUDE.md` | Reglas globales del proyecto |
| `.claude/COORDINATION.md` | Plan de trabajo |
| `.claude/LOCKS.md` | Este archivo |
| `lib/roadmap/items.ts` | Catalogo de items del roadmap |
| `app/admin/_lib/tabs.types.ts` | Tipos de tabs (afecta front + back) |
| `app/admin/_lib/tab-data.ts` | Data de tabs (afecta front + back) |
| `app/admin/_lib/tab-categories.ts` | Categorias de tabs |

---

## Historial de conflictos

| Fecha | Frentes | Archivo | Resolucion |
|-------|---------|---------|------------|
| (ninguno aun) | - | - | - |

---

## Reglas de lock

1. **Primer declarado, primer servido** — el frente que escribe primero tiene prioridad
2. **Granularidad de archivo** — no de directorio. Dos frentes pueden tocar archivos DISTINTOS en el mismo directorio
3. **Locks expiran al cerrar la ola** — el orchestrator limpia todo
4. **Emergencia** — si un frente NECESITA un archivo bloqueado, pide al orchestrator que negocie
5. **Schema Prisma** — siempre exclusivo de `frente-back`. Front y QA nunca tocan schema
