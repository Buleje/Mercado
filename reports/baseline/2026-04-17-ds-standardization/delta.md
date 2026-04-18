# ADR-075 DS Standardization — Delta pre/post

## TSC
- Pre-sprint: 0 errores
- Post-sprint: 0 errores
- Regresiones: 0

## Violations en components/admin + app/admin

| Metrica | Pre | Post | Delta |
|---|---|---|---|
| `text-gray-{300..900}` (archivos) | 220 | 0 | -100% |
| `from "lucide-react"` directo (archivos) | 271 | 0 | -100% |
| `style={{}}` inline (ocurrencias) | 643 | 643 | 0% |
| Total lint warnings | 13,078 | 3,044 | -77% |
| Lint files con warnings | 577 | 471 | -18% |

## Archivos modificados

- 576 archivos en el bulk migrate
- 5 archivos en refactor manual (DashboardTab, PrestamosModule, CashRegisterTab, TesoreriaModule, CotizacionesModule)
- 5 archivos nuevos en el DS (typography, layout, feedback, data-display, icons)
- 1 archivo nuevo en scripts (migrate-to-ds.mjs)
- 1 archivo modificado en scripts (lint-design-tokens.ts — 5 reglas nuevas)
- 1 archivo nuevo en docs/adr (075-design-system-single-source-of-truth.md)

## Commits (11 atomicos)

1. `feat(design-system): add canonical typography primitives`
2. `feat(design-system): add canonical layout primitives`
3. `feat(design-system): add canonical icons re-export`
4. `feat(design-system): add canonical feedback alerts`
5. `feat(design-system): add canonical data-display components`
6. `feat(design-system): update index barrel + package exports`
7. `feat(design-lint): enforce DS single source of truth (ADR-075)`
8. `chore(scripts): add migrate-to-ds bulk transformer`
9. `feat(design-system): expand icons re-export to full admin set`
10. `refactor(admin): bulk migrate 576 files to DS tokens + icons`
11. `refactor(admin): migrate 5 TOP modules to DS alert primitives`
12. (pendiente) `docs(adr): adr-075 DS single source of truth`

## Pendientes (post-sprint)

1. Migrar `style={{}}` inline residual (643 ocurrencias; muchas son legitimas de recharts).
2. Migrar h1/h2/h3 locales a `PageTitle/SectionTitle/CardTitle` (624 occurrencias — requiere cambio semantico por archivo).
3. Migrar KPIs ad-hoc a `StatCard` en los 5 modulos TOP restantes (Customer360Tab, InventoryTab, SettingsModule, TesoreriaModule, etc).
4. Migrar `<table>` ad-hoc a `DataTable`.
5. Activar `--design-strict` en CI gate una vez que el warning count baje de 500.
