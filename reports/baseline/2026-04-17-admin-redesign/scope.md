# Pre-redesign baseline — 2026-04-17

**Branch:** `feat/brand-system-v4-complete`
**Baseline at:** 2026-04-17T19:17Z
**HEAD:** 7aa0305 chore(dev): switch default dev server to turbopack

## Gates

| Gate | Estado |
|---|---|
| `git status --short` | 0 archivos dirty |
| `npx tsc --noEmit` | 0 errors |
| ADR-074 | Aceptado (token swap masivo completo) |

## Conteo de patrones "genericos" (pre-redesign)

### rounded-2xl (target: 0 en admin/superadmin cards)

| Path | Ocurrencias | Archivos |
|---|---|---|
| `components/admin` | **0** | 0 |
| `components/superadmin` | **37** | 22 |
| `app/admin` | **0** | 0 |
| `app/superadmin` | **72** | 17 |
| **Total** | **109** | **39** |

### text-{color}-{300-700} (target: 0 en hojas de lucide `<Icon>`)

NOTA: el conteo incluye text-color-XXX en cualquier contexto (badges,
pills, chips — donde es legitimo). El objetivo **no** es eliminar todos,
sino solo los que estan en props `className` de `<Icon />` de lucide,
mas los pares asimetricos hardcoded.

| Path | Ocurrencias | Archivos |
|---|---|---|
| `components/admin` | 2440 | 434 |
| `components/superadmin` | 90 | 20 |

### bg-{color}-{50\|100} (target: 0 en cards admin — pero OK en status chips)

NOTA: mismo caveat. bg-emerald-50 en un status chip es **correcto**
(match a StatusBadge variants). El target es eliminar los que estan en
cards de seccion (el ejemplo: bg-sky-50 en DashboardComprasCajaSection).

| Path | Ocurrencias | Archivos |
|---|---|---|
| `components/admin` | 2560 | 437 |
| `components/superadmin` | 89 | 17 |

### Hex `#XXXXXX` (target: 0 fuera de tokens — excepcion: tenant branding)

| Path | Ocurrencias | Archivos |
|---|---|---|
| `components/admin` | 2029 | 267 |
| `components/superadmin` | 31 | 6 |

## Componentes de referencia (modelo universal)

| Componente | Estado | Nota |
|---|---|---|
| `UnifiedKPITile` | Perfecto | tokens puros, intent semantico, sparkline auto-color |
| `StatusBadge` | Semi-generico | variants usan bg-emerald-50/red-50 directo. Target: migrar a tokens `data-*` con alpha wrapper |
| `AdminCard` | Semi-perfecto | usa `rounded-xl + border-[var(--rule-soft)]`. Target: eliminar fallback `dark:bg-zinc-900` y normalizar a `bg-[var(--surface-raised)]` |
| `KPICard` | Con legacy | border-l-[3px] con hex inline + inline style backgroundColor `${color}15` + text-emerald-600/red-500 hardcoded |

## Modulos "genericos" concretos (prioridad alta)

1. `components/admin/dashboard/DashboardComprasCajaSection.tsx`
2. `components/admin/dashboard/DashboardUI.tsx`
3. `components/admin/vendor-dashboard/VendorKPICards.tsx`
4. `components/admin/fiados/FiadoStats.tsx`
5. `components/superadmin/_shared/SAStatCard.tsx`

## Estrategia

1. Arreglar los primitives `StatusBadge` + `KPICard` + `AdminCard` para que cualquier migracion posterior pueda usarlos tal cual.
2. Arreglar los 5 modulos concretos.
3. Sweep dirigido de `rounded-2xl` en superadmin (109 -> 0).
4. Sweep dirigido de iconos con colores saturados en hoja de lucide.
