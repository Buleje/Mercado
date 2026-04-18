# Sprint D — Baseline delta

**Fecha**: 2026-04-17
**Branch**: `feat/brand-system-v4-complete`
**Commits**: 8 (v3 script + v3 bulk + LoadingState + loaders + DataTable + StatCard expansion + headings + husky)

## Resumen ejecutivo

| Metrica | Pre | Post | Delta | Target | Status |
|---|---|---|---|---|---|
| **Total warnings** | 660 | 449 | **-211 (-32%)** | < 200 | Parcial |
| **Total files con warnings** | 274 | 206 | -68 (-25%) | — | — |
| **TSC errors** | 0 (excl .next) | 0 | 0 | 0 | Cumplido |

## Delta por regla

| Regla | Pre | Post | Delta | Target | Status |
|---|---|---|---|---|---|
| `ds-no-decorative-color-admin` | 355 | 194 | **-161 (-45%)** | < 100 | Parcial |
| `ds-no-raw-table-in-admin` | 190 | 182 | -8 | < 100 | Parcial |
| `ds-no-style-inline-any-color` | 34 | 34 | 0 | — | — |
| `ds-no-style-color-inline` | 26 | 26 | 0 | — | — |
| `ds-no-raw-loader-block-in-admin` | 24 | **3** | **-21 (-87%)** | < 5 | **Cumplido** |
| `ds-no-heading-with-design-class` | 16 | **0** | **-16 (-100%)** | 0 | **Cumplido** |
| `ds-no-inline-alert-pattern` | 15 | 10 | -5 | — | — |

## Delta por adopcion DS

| Primitive | Antes Sprint C | Despues Sprint D | Delta |
|---|---|---|---|
| `<StatCard>` consumers (admin+superadmin) | 20 | 26 | +6 files |
| `<DataTable>` consumers (admin) | 0 | 5 | +5 (Sprint D3) |
| `<LoadingState>` consumers (admin) | 16 | 39 | +23 (Sprint D2) |

## Commits atomicos

1. `58e0d62a` — chore(scripts): migrate-to-ds-v3 (AST carriers + neutral decoratives)
2. `cdaae8f1` — refactor(admin): bulk migrate decorative colors v3 (98 files, 535 replacements)
3. `d0e4ffe5` — feat(design-system): LoadingState variants overlay/inline/fullscreen
4. `a6a73777` — refactor(admin): adopt LoadingState in 23 admin modules
5. `6d0e7e08` — refactor(admin): migrate 5 tables to DataTable
6. `b86a0206` — feat(design-system): expand StatCard density + sparkline
7. `52b27265` — refactor(admin): migrate 16 heading residuales to DS typography
8. `c9323da4` — feat(husky): activate --design-strict as warning in pre-commit

## Restricciones respetadas

- Danger zone intacta (proxy.ts, middleware, orders.db.ts, checkout/, cart-context.tsx, schema.prisma, role-permissions.ts).
- TSC: 0 errores reales (ignorando `.next/dev/types/validator.ts` auto-generado).
- 0 HUSKY bypass.
- 0 regresiones visuales detectadas (cambios son token-for-token).

## Residuo para Sprint E

### 1. Decorative colors (194 hits)
Los restantes son **let variables con ternarios de estado computado**:
```tsx
let color = "bg-[var(--accent-soft)]";
if (pct >= 50) { color = "bg-amber-400"; textColor = "text-amber-600"; }
else { color = "bg-red-500"; textColor = "text-red-600"; }
```
v3 AST traversal solo maneja `const` via VariableDeclarator. `let` con AssignmentExpression requeriria tracking de control flow —
mejor migrados por archivo con revision humana.

### 2. Raw tables (182 hits)
Muchas tablas tienen estructura compleja (dynamic headers con `selectedOCs.map(th => ...)`, rowspan/colspan, nested tables).
DataTable absorbe bien las simples — para complejas, evaluar caso por caso si conviene extender DataTable con `columns`/`data`
schema o dejar como legit.

### 3. Style inline (60 hits combinados)
`style={{ color: "#...", fontSize: "0.75rem" }}` — casos de tenant branding dinamico o ajustes de tipografia one-off. Candidato
para migracion manual archivo-por-archivo.

### 4. --design-strict gate → bloqueante
Una vez que el total baje de **100 warnings**, promover la regla 5 del pre-commit de `|| true` a `|| exit 1`. Probablemente
alcanzable en Sprint E con migracion manual de los `let` variables + tables simples.
