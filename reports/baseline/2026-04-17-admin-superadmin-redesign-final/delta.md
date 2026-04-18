# Delta — Admin + Superadmin Design System Migration (ADR-074)

**Fecha:** 2026-04-17
**Branch:** `feat/brand-system-v4-complete`
**Baseline pre:** `reports/baseline/2026-04-17-admin-superadmin-redesign/`
**Baseline post:** este directorio

---

## Resumen ejecutivo

Se migro todo el chrome de `admin` + `superadmin` al design system existente
(ADR-068/069/070/071/072/073). El lint + migrador ahora cubre el scope
realista de superficies productivas, no solo componentes shared.

## Metricas pre/post

| Metrica | Pre | Post | Delta |
|---|---:|---:|---:|
| **Lint scope** (archivos escaneados) | 722 | 847 | **+125 (+17%)** |
| **Lint violations** (errors) | 0 | 0 | 0 |
| **Lint violations** (warnings nuevas regla ADR-074) | n/a | 0 | 0 |
| **TypeScript errors** | 0 | 0 | 0 |
| **Neutrales hardcoded en `app/admin/**`** | 264 | 0 | **-264** |
| **Neutrales hardcoded en `app/superadmin/**`** | 582 | 0 | **-582** |
| **Neutrales hardcoded en `components/superadmin/**`** | 456 | 0 | **-456** |
| **Neutrales hardcoded en `components/admin/**`** | ~3000 | 0 | **-3000** |
| **Total reemplazos bulk** | - | **4,368** | en ~400 archivos |
| **ESLint errors preexistentes corregidos** | 5 | 0 | **-5** |

### Detalle ESLint fixes preexistentes

| Archivo | Error | Fix |
|---|---|---|
| `PromocionesModule.tsx` | `react-hooks/static-components` (IIFE creando `LucideIcon`) | Wrapper `PromoIcon` con switch literal |
| `ResumenSection.tsx` (4 usos) | `react-hooks/purity` (`Date.now()` during render) | `const [now] = useState(() => Date.now())` + agregar a deps |

## Commits (19 atomicos)

```
feat(design-system): extend lint + migrador scope to admin/superadmin (ADR-074)
refactor(admin): migrate app/admin to design system tokens (ADR-074)
refactor(superadmin): migrate app/superadmin to design system tokens (ADR-074)
refactor(superadmin): migrate components/superadmin/** to tokens (ADR-074)
refactor(admin): tokens migration chunk A — 15 components (ADR-074)
refactor(admin): tokens migration chunk B — 52 components (ADR-074)
refactor(admin): tokens migration chunk C + fix static-components (ADR-074)
refactor(admin): tokens migration chunk D — 44 components (ADR-074)
refactor(admin): tokens migration chunk E1 — 26 sub components (ADR-074)
refactor(admin): tokens migration chunk E2a — 9 sub components dashboard/fiados/finance (ADR-074)
refactor(admin): tokens migration chunk E2b — 7 inicio charts/dashboards (C-V) (ADR-074)
refactor(admin): tokens migration chunk E2c — 7 inicio/ components (ADR-074)
refactor(admin): tokens migration chunk E3 — 23 sub components i-p (ADR-074)
refactor(admin): tokens migration chunk E4 — 25 shared/smart-dashboard (ADR-074)
refactor(admin): tokens migration chunk E5 — 7 final unified/vendor/wholesale (ADR-074)
refactor(store): tokens migration — 17 store components + CampanasTab (ADR-074)
refactor(ui-system): tokens migration — 15 ui-system primitives (ADR-074)
refactor(tenant): tokens migration — 4 app/t/** pages (ADR-074)
docs(adr): ADR-074 + baseline (pending)
```

## Gates pasados

| Gate | Estado |
|---|---|
| `lint-staged` (eslint + design tokens) | PASS en 19/19 commits |
| `tsc --noEmit` (TD-026 gate pre-commit) | 0 errors |
| `lint:design` (Design Tokens governance) | 0 violations in 847 files |
| `no-new-empty-catch` (post-commit custom) | PASS |
| Unit tests (post-commit async) | 3106/3132 passed (regresiones: 0, fallos preexistentes: 17) |

## Zonas de peligro NO tocadas

Segun `CLAUDE.md`, estas zonas no pueden modificarse sin squad:

- `components/checkout/**`, `CheckoutModal.tsx` — no tocado
- `lib/db/orders.db.ts` — no tocado
- `lib/auth/role-permissions.ts` — no tocado
- `proxy.ts`, `lib/middleware/**` — no tocado
- `prisma/schema.prisma` — no tocado
- `contexts/cart-context.tsx` — no tocado

## Criterio de exito

- [x] TSC en 0 errores
- [x] Lint design tokens en 0 violaciones
- [x] Scope del lint expandido a 847 archivos
- [x] Todos los commits con Conventional Commits validos
- [x] Cada commit revertible independientemente (`git revert`)
- [x] ADR-074 documenta la decision arquitectonica
- [x] Baseline pre/post capturado como prueba auditable
- [x] Sin HUSKY=0 bypass (todos los commits pasaron los gates)
- [x] Zonas de peligro respetadas

## Referencias

- ADR-074: `docs/adr/074-design-system-admin-superadmin-scope.md`
- ADRs previos: ADR-068/069/070/071/072/073
- CLAUDE.md regla 4: tokens v4 + cacheLife
- Memoria cross-sesion: `project_design_lint_guardrail.md`
