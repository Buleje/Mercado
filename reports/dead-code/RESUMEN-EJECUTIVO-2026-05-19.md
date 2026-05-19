# Knip Dead-Code Audit — Resumen Ejecutivo

> **Fecha:** 2026-05-19 · **Branch:** `chore/production-ready-final` · **Tool:** knip 6.14.1

## TL;DR

Knip detectó **779 archivos no usados + 9 deps + 14 devDeps + 296 exports + 205 types + 36 dups**, pero
**la herramienta tiene falsos positivos masivos en este repo** porque no
sigue:

- `import("gsap")` dinámicos por string → marca `gsap` como dead aunque se use en 3 componentes
- `next/dynamic(() => import("@/..."))` en `app/admin/page.tsx` → marca tabs como huérfanos
- Sub-deps reales que dependen de tipos peer (`@types/bcryptjs`)

**Recomendación: NO borrar masivamente con este reporte.** Validación 1×1
es obligatoria. Sprint dedicado de 4-8 h estimadas.

## Tabla de validaciones (muestra de 12 items)

### Dependencias

| Dep | Knip dice | Realidad (grep) | Veredicto |
|---|---|---|---|
| `gsap` | Unused | 3 imports dinámicos vivos | **FALSO POSITIVO** |
| `@types/bcryptjs` | Unused devDep | bcryptjs v3 sin types nativos | **FALSO POSITIVO** |
| `posthog-js` | Unused | 8 imports vivos | **FALSO POSITIVO** |
| `embla-carousel-react` | Unused | usada en componente vivo (landing) | **FALSO POSITIVO** |
| `@radix-ui/react-hover-card` | Unused | usada en AdminModal | **FALSO POSITIVO** |
| `@radix-ui/react-select` | Unused | usada en AdminSelect | **FALSO POSITIVO** |
| `vaul` | Unused | usada en AdminDrawer + motion.ts | **FALSO POSITIVO** |
| `@radix-ui/react-visually-hidden` | Unlisted | usada en AdminModal pero no declarada | **REAL — declarar explícito** |

### Archivos

| Archivo | Knip dice | grep refs externas | Veredicto |
|---|---|---|---|
| `app/admin/_components/AdminMainContent.tsx` | Unused | importado en `app/admin/page.tsx` | **FALSO POSITIVO** |
| `components/Benefits.tsx` | Unused | 3 refs (cms, abrir-tienda, vender) | **FALSO POSITIVO** |
| `components/HowItWorks.tsx` | Unused | 3 refs (gift-cards, explorar) | **FALSO POSITIVO** |
| `components/landing/ScrollyHowItWorks.tsx` | Unused | 0 refs externas | **HUÉRFANO REAL** |
| `components/BetaFeedbackWidget.tsx` | Unused | 0 refs externas | **HUÉRFANO REAL** |
| `components/CursorFix.tsx` | Unused | 0 refs externas | **HUÉRFANO REAL** |
| `components/DailyDeal.tsx` | Unused | 0 refs externas | **HUÉRFANO REAL** |
| `app/admin/store-page/_components/{Combos,Discounts,Engagement,Products,Variations}Tab.tsx` | Unused | sospechosos (admin store-page suite legacy) | **PENDIENTE VALIDAR** |

**Distribución cruda (779 files):**

| Carpeta | Files unused |
|---|---|
| `components/admin/*` | 379 (49%) |
| `components/marketplace/*` | 92 |
| `components/store/*` | 28 |
| `components/ui-system/*` | 20 |
| `components/superadmin/*` | 16 |
| `components/landing/*` | 12 |
| `components/ui/*` | 11 |
| `components/customer/*` | 10 |
| `lib/db/*` | 6 |

La mayoría falsos positivos por `next/dynamic` en `app/admin/page.tsx` (133 tabs).

## Action items (orden de seguridad)

### Riesgo CERO (aplicables sin validación adicional)

1. **Declarar `@radix-ui/react-visually-hidden` en `package.json`**  
   Está usada en `components/admin/shared/AdminModal.tsx`. Hoy resuelve como
   sub-dep de Radix; si Radix la deja de exportar como peer, se rompe sin warning.

### Riesgo BAJO (validar grep × archivo antes)

2. **Borrar 4 huérfanos confirmados** (0 refs externas):
   - `components/landing/ScrollyHowItWorks.tsx`
   - `components/BetaFeedbackWidget.tsx`
   - `components/CursorFix.tsx`
   - `components/DailyDeal.tsx`

3. **Auditar 5 `app/admin/store-page/_components/*Tab.tsx`** (sospechosos legacy)

### Riesgo MEDIO (sprint dedicado)

4. **Validar 379 components/admin/* huérfanos** uno por uno
5. **Validar 92 components/marketplace/* huérfanos**
6. **Revisar 296 unused exports + 205 types** (sin riesgo runtime, pero ruido en autocomplete)
7. **Limpiar 36 duplicate exports** (named + default — convención inconsistente)

### NO TOCAR (falsos positivos)

- `gsap`, `posthog-js`, `embla-carousel-react`, `@radix-ui/react-hover-card`, `@radix-ui/react-select`, `vaul`, `@types/bcryptjs`
- Cualquier archivo que se importe vía `next/dynamic` o `import()` string

## Configuración aplicada

`knip.json` creado con:
- `ignore`: `.claude/`, `scripts/`, `playground/`, tests, stories, `lib/generated/`
- `ignoreDependencies`: `@prisma/client`, `@capacitor/*`, `@playwright/mcp` (todos válidos pero no detectados)
- `ignoreBinaries`: `cap`, `k6`, `del`

## Tiempo estimado por nivel

| Tarea | Esfuerzo |
|---|---|
| Action 1 (declarar dep) | 2 min |
| Action 2 (4 borrados confirmados) | 5 min |
| Action 3 (5 store-page tabs) | 15 min |
| Action 4-7 (sprint completo) | 4-8 h |

## Archivos relacionados

- `reports/dead-code/knip-2026-05-19.txt` (sin config — 1106 unused files)
- `reports/dead-code/knip-2026-05-19-filtered.txt` (con `knip.json` — 779 unused files)
- `knip.json` (config aplicada)
