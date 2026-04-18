# Superadmin Ola 3 — baseline delta (2026-04-17)

## Resumen

Ola 3 cierra la trilogia de identidad superadmin con **eliminacion** fisica de
2 modulos accesorios y fixes finales de chrome.

## Deltas cuantitativos

| Metrica | Pre | Post | Delta |
|---|---|---|---|
| Items sidebar superadmin | 13 | 11 | -2 |
| Modulos superadmin (app/superadmin/*) | 18 | 16 | -2 |
| Endpoints API superadmin | 24 | 22 | -2 |
| TSC errors | 0 | 0 | 0 (sin regresion) |
| Lineas eliminadas (modulos) | — | — | -2,825 |
| Archivos eliminados | — | — | 4 |

## Archivos eliminados

- `app/superadmin/project-intel/page.tsx` (671 LOC)
- `app/api/superadmin/project-intel/route.ts` (~400 LOC)
- `app/superadmin/integraciones/page.tsx` (~900 LOC)
- `app/api/superadmin/integrations/route.ts` (~300 LOC)

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `components/superadmin/SuperAdminShell.tsx` | -2 items sidebar, -2 pageTitles, -2 imports (Package, Cable) |
| `components/superadmin/CommandPalette.tsx` | -1 item nav (nav-project), -1 import (Package) |
| `lib/site-map.ts` | -2 entries (project-intel, integraciones) |
| `scripts/visual-verify-superadmin.mjs` | Removido project-intel de la lista |
| `components/superadmin/setup/ScoreDashboard.tsx` | 4 tiles migrados a StatCard DS con emphasis condicional |
| `app/superadmin/security/page.tsx` | Tasa exito con umbral `MIN_EVENTS_FOR_RATE=10`; ACTION_CONFIG timeline con iconos neutros para eventos rutinarios |
| `app/superadmin/analytics/page.tsx` | Removido border-top gradient (7 tiles), iconos seccion → neutral |
| `app/superadmin/stores/page.tsx` | Tab activo → accent-soft (chrome neutral), icono header neutral |

## Commits (6 atomicos)

1. `04b583f7` chore(superadmin): remove project-intel module completely
2. `f70c25e8` chore(superadmin): remove integraciones module completely
3. `97aa4abb` refactor(superadmin): setup score dashboard adopt StatCard DS (Ola 3)
4. `a932f449` refactor(superadmin): security tasa exito conditional emphasis + timeline review (Ola 3)
5. `2f9fc99d` refactor(superadmin): residual chrome cleanup stores + analytics (Ola 3)
6. `<next>`  chore(scripts): visual-verify-superadmin-ola3-post + baselines

## Identidad visual — antes/despues

### Sidebar
- **Pre:** 13 items (Dashboard, Centro Control, Roadmap, **Proyecto**, **Integraciones**, Tiendas, Marketplace, Analytics, Salud, Setup, Actividad, Seguridad, Config)
- **Post:** 11 items (Dashboard, Centro Control, Roadmap, Tiendas, Marketplace, Analytics, Salud, Setup, Actividad, Seguridad, Config)

### Setup ScoreDashboard
- **Pre:** 4 divs manuales con text-data-success/warning/error/gray + emojis (✅⚠️❌➖).
- **Post:** 4 `<StatCard density="default">` con iconos neutros y emphasis condicional (N>0 → semaforo; N=0 → neutral).

### Security tasa exito
- **Pre:** `emphasis="error"` siempre que `successRate < 80%` → falsa alarma en deployments nuevos sin eventos (0% con 0 eventos).
- **Post:** `rateEmphasis = totalLoginEvents >= 10 && successRate < 80 ? "error" : "neutral"` — solo semaforo con volumen suficiente.

### Security timeline
- **Pre:** login_success verde + 2fa_challenge verde + logout gris + criticos en rojo.
- **Post:** Eventos rutinarios (login_success, 2fa_challenge, logout) grises neutros.
  Criticos (login_failed, login_locked) rojos, 2fa_failed amber — senal genuina que
  el operador necesita discriminar.

### Analytics
- **Pre:** 7 tiles con border-top gradient hex hardcoded (#00B4A6, #6366f1, #22c55e, #f59e0b).
- **Post:** Tiles limpios, solo borde neutro. Iconos de section headers grises.

### Stores
- **Pre:** Tab activo `bg-primary text-white shadow-md shadow-primary/25`.
- **Post:** Tab activo `bg-[var(--accent-soft)] text-[var(--accent)]` (coherente con sidebar pattern).

## Verificacion

- [x] TSC 0 errores (pre y post)
- [x] Lint 0 errores nuevos
- [x] Pre-commit gates PASS en los 5 commits
- [x] Danger zone intacta (checkout, orders, RBAC, proxy, schema, cart)
- [x] Sin bypass HUSKY=0
- [x] Grep final `project-intel|integraciones` en code (excluyendo docs/reports/node_modules) = 0 en sidebar/commands/site-map

## Sprint wrap — trilogia superadmin completa

Ola 1 (dashboard + tenants) + Ola 2 (security + health + shell topbar) +
Ola 3 (eliminacion + setup + residual chrome) — identidad superadmin
enterprise-neutral completada. Proximo sprint wrap puede cerrar formalmente
con ADR addendum + sprint-wrap skill.
