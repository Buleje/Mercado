# Auditoría de Arquitectura — Buleje
**Fecha:** 2026-05-25 · **Alcance:** estructura de carpetas, límites de módulos, capas, acoplamiento, deuda estructural, escalabilidad
**Base medida:** 727K LOC fuente (excl. `lib/generated`), 30 segmentos `app/`, 886 `route.ts`, 194 clases `lib/db/*.db.ts`, 109 ADRs, 422 componentes admin.

> Toda métrica fue medida directamente (grep/wc/find), no estimada. Donde la doc (CLAUDE.md) discrepa de la realidad, se nota.

---

## Resumen por severidad

| Severidad | # |
|---|---|
| P0 (riesgo estructural serio) | 1 |
| P1 (deuda que frena velocidad) | 4 |
| P2 (mejora de orden) | 4 |

---

## Tabla priorizada

| # | Sev | Hallazgo | Evidencia (medida) | Refactor concreto |
|---|-----|----------|--------------------|--------------------|
| A1 | **P0** | **275 route handlers acceden a `prisma.*` directo**, violando regla crítica #1 (cache + audit + tenantId). Solo 30 tienen excepción documentada `@prisma-direct`. Bypass real de cache/audit/aislamiento, no solo estilo. | `grep prisma.<modelo>.(find\|create\|update...)` en `app/api` = **275 archivos**. Con `@prisma-direct` = **30**. Top: `cron` 57, `superadmin` 36, `delivery` 28, `admin` 18. | (1) Excluir `cron` legítimo (sweep cross-tenant) marcándolo `@prisma-direct` explícito. (2) Migrar los ~190 routes de negocio (superadmin/delivery/admin/products/orders) a clases `lib/db/*`. (3) Lint rule que prohíba `import { prisma }` en `app/api/**` salvo comentario `@prisma-direct`. |
| A2 | **P1** | **Cero abstracción de data-fetching en el cliente.** 369 `fetch()` crudos en `components/admin`, 0 usos de SWR/react-query/useApi. Cada componente reimplementa loading/error/cache/abort. | `grep fetch( components/admin` = **369**. `grep useSWR\|useQuery\|useApi\|useFetch` = **0**. `hooks/` = 85 archivos, ninguno genérico de fetch. | Crear `hooks/use-api.ts` (o adoptar SWR — ya hay Upstash para server cache, falta cliente). Migrar incrementalmente los módulos más tocados (Marketplace, Inventory, Dashboard). Reduce ~30% del LOC de los módulos gigantes. |
| A3 | **P1** | **Componentes-monolito con lógica de negocio + 30-40 responsabilidades.** No son solo "grandes": concentran estado, fetch, sub-vistas y reglas. | `MarketplaceModule.tsx` **4153 LOC**, 37 `useState`, 53 funciones internas, 5 fetch. `InventoryTab` 3077 LOC/57 useState. `DashboardTab` 3057, `StoreCustomizer` 3004, `PrestamosModule` 2705. 14 componentes >2000 LOC. | Patrón ya probado en `app/admin/page.tsx` (430 LOC, 34 hooks en `_hooks/`, vistas en `_components/`). Replicarlo: extraer sub-vistas a `components/admin/<modulo>/`, estado a hooks, reglas a `lib/`. Empezar por MarketplaceModule. |
| A4 | **P1** | **Organización inconsistente de `components/admin/`: 381 `.tsx` flat en la raíz** conviviendo con 40 subcarpetas temáticas. Patrón mixto = navegación difícil, fricción al ubicar dónde va un archivo nuevo. | `ls components/admin/*.tsx` = **381 flat**; subdirs = **40**. Tabs en 2 sitios: raíz (`*Tab.tsx`=163) y `components/admin/tabs/` (5). Sufijos mezclados: 163 `Tab`, 17 `Module`, 2 `View`. | Mover cada `XTab.tsx` flat a su subcarpeta de dominio (`components/admin/<dominio>/`). Estandarizar 1 sufijo por convención. Migración mecánica + ADR de naming. No urgente pero crece la entropía. |
| A5 | **P1** | **Duplicación de `formatCurrency` en 25 componentes** pese a existir `lib/currency.ts` (export central). Riesgo: redondeo/IGV divergente entre vistas (dinero). | `grep "const/function formatCurrency" components` = **25** locales. `lib/currency.ts` ya exporta `formatCurrency`, `formatCurrencyCompact`, `calculateDiscount`. | Reemplazar las 25 copias por `import { formatCurrency } from "@/lib/currency"`. Lint rule contra redefinición. Cierra riesgo de inconsistencia monetaria. |
| A6 | **P2** | **63 `.parse(` en `app/api`** detectados por grep — al verificar son casi todos `JSON.parse`/`Number.parse`, no Zod `.parse()`. **Falso positivo de auditores previos**; no hay violación real de regla #2. | Filtrando `JSON.parse\|Number.parse\|parseInt\|Date.parse` quedan **0** Zod `.parse()`. | Ninguna acción. Se documenta para no re-abrir el hallazgo. |
| A7 | **P2** | **CLAUDE.md desactualizado vs realidad** en cifras estructurales: induce a decisiones erradas (ej. "dividir page.tsx 133 tabs" cuando ya está refactorizado). | Doc dice `lib/db ≈90` → real **194**. Doc dice `158 endpoints` → real **886**. Doc/encargo dice "`page.tsx` con 133 tabs monolito" → real **430 LOC** ya modularizado. | Actualizar §2/§3 de CLAUDE.md con cifras medidas. Quitar `page.tsx` de la lista de monolitos a dividir. |
| A8 | **P2** | **3 inversiones de capa `lib/ → app/`** (lib no debería depender de app). Bajo impacto hoy, pero rompe la regla de dependencias y complica extraer `lib` a paquete. | `grep "from @/app" lib` = `billing/plan-tiers.ts`, `webhook-dispatcher.ts`, `verticals/registry.ts`. | Mover los tipos/constantes importados desde `app/` hacia `lib/` o `packages/`. Aislamiento limpio. |
| A9 | **P2** | **Concentración marketplace en 1 UI-monolito + 1 db grande.** `MarketplaceModule` 4153 LOC y `marketplace-public.db.ts` 1425 LOC (la db más grande). Es el dominio de mayor crecimiento futuro (multi-vendor, comisiones). | Ver A3. `lib/db/marketplace-public.db.ts` = 1425 LOC (vs media db ~190). | Sub-dividir `marketplace-public.db.ts` por responsabilidad (catálogo / vendors / órdenes / comisiones). Prioritario por ser zona de dinero cross-vendor (CLAUDE.md §6). |

---

## Lo que YA está bien hecho (no tocar)

| Acierto | Evidencia |
|---|---|
| **Capa de datos genuinamente desacoplada** | **0** imports de `prisma.*` en `components/` (UI nunca toca ORM). **0** deps `lib/db → components`. La separación UI↔datos en el cliente es real. |
| **`lib/db` bien decompuesto, sin god-class** | 194 clases, media ~190 LOC, máxima 1425. No hay un "monolith.db" de 5000 líneas. Decomposición por dominio sana. |
| **`app/admin/page.tsx` ya modernizado** | 430 LOC, 34 hooks extraídos en `_hooks/` (2455 LOC repartidos), tab-data en `_lib/`, chrome diferido con `next/dynamic`. Es el modelo a replicar, no un problema. |
| **Layering casi limpio** | Solo 3 inversiones `lib→app` en todo el repo. Dirección de dependencias respetada. |
| **Cron justifica su prisma directo** | Sweeps cross-tenant batch (ej. `abandoned-cart`) — caso legítimo de bypass; solo falta marcarlo explícito. |
| **109 ADRs vivos** | Decisiones arquitecturales documentadas y versionadas (057 hub-spoke, 100 verticals, 114 RLS híbrido). Trazabilidad fuerte. |

---

## Plan de refactor (orden sugerido)

```
Fase 1 — Blindaje (P0, 1-2 sprints)
  └─ Lint rule: prohibir import {prisma} en app/api salvo @prisma-direct
  └─ Marcar los 57 cron + casos batch como @prisma-direct (rápido)
  └─ Migrar ~190 routes de negocio a lib/db/* (incremental por dominio)

Fase 2 — Velocidad de UI (P1)
  └─ hooks/use-api.ts (o SWR) → migrar Marketplace/Inventory/Dashboard
  └─ Extraer sub-vistas de los 14 componentes >2000 LOC (patrón page.tsx)
  └─ Reemplazar 25 formatCurrency locales por lib/currency

Fase 3 — Orden (P2)
  └─ Reubicar 381 *.tsx flat de components/admin a subcarpetas de dominio
  └─ Corregir 3 inversiones lib→app
  └─ Sub-dividir marketplace-public.db.ts
  └─ Actualizar cifras en CLAUDE.md
```

### Verificación post-refactor (recomendada al equipo)
```bash
cd buleje
npm run lint && npm run build && npm run test
npx prisma validate   # si toca schema
```
