# Sub-Proyecto #3 — Error Hunt & Stabilization

**Fecha:** 2026-04-16
**Autor:** Brandon Buleje (con asistencia de Claude)
**Estado:** Draft — pendiente review
**Parent:** [Roadmap maestro](2026-04-16-programa-optimizacion-proyecto-design.md)

---

## Contexto

Este es el **primer sub-proyecto** del programa de optimización. Su objetivo es dejar el proyecto en verde: 0 tests rojos, 0 errores TS, 0 warnings críticos. Sin esto, cualquier otro trabajo (design system, animaciones, performance) se pinta encima de base agrietada.

---

## Baseline capturado 2026-04-16

### Métricas de partida

| Métrica | Valor hoy | Meta al cerrar |
|---|---|---|
| Test files failing | 17 de 189 (9%) | 0 |
| Tests failing | 71 de 2621 (2.7%) | 0 |
| TSC errors | 83 líneas | 0 |
| Lint | Pasa (warning de deprecación) | Pasa sin warnings |
| Build | Falla (node_modules no instalado) | Pasa en CI |
| Dirty files | 11 (post-cleanup) | 0 |

### TSC: errores concentrados

| Archivo | Errores | Patrón |
|---|---|---|
| `__tests__/api-treasury-transferencias.test.ts` | 15 | Expected 1 arg, got 2 (signature change) |
| `__tests__/api-campaigns-create.test.ts` | 15 | Expected 1 arg, got 2 |
| `tools/mcp-bodega/src/index.ts` | 14 | Typing del MCP |
| `app/api/marketplace/search/suggestions/route.ts` | 13 | 'CartItem', 'unknown' — tipos |
| `__tests__/api-fiados-cobrar.test.ts` | 10 | Expected 1 arg, got 2 |
| `components/marketplace/MarketplaceCrossStoreCombos.tsx` | 6 | Tipos marketplace |
| `lib/marketplace/cross-store-combos.ts` | 4 | Tipos |
| `app/t/[slug]/_components/TenantSectionsWrapper.tsx` | 2 | `TiendaSectionsProps` |

**Causa raíz probable:** signatura de alguna DB class o helper cambió (de aceptar 2 args a 1), pero los tests que la usan no fueron actualizados. Los errores de marketplace parecen relacionados a un refactor de `cross-store-combos` incompleto.

### Tests: fallos concentrados

| Archivo | Fallos | Tipo |
|---|---|---|
| `admin-module-standards.test.ts` | 19 | Architectural enforcement — probablemente reglas que el código viola |
| `api-activity-log.test.ts` | 11 | Signature |
| `api-notes.test.ts` | 8 | Signature |
| `api-message-templates.test.ts` | 7 | Signature |
| `api-campaigns-create.test.ts` | 7 | Signature (ya visto en TSC) |
| `api-treasury-transferencias.test.ts` | 5 | Signature |
| `api-fiados-cobrar.test.ts` | 5 | Signature |
| `ProductGallery.test.tsx` | 1 | Design token — espera `border-primary`, recibe `border-[#00B4A6]` |
| `ProductVariantSelector.test.tsx` | 1 | Design token — mismo patrón |
| `image-placeholders.test.ts` | 2 | Contenido / fixture |

**Patrón dominante:** ~50-60 fallos son por cambios de signatura en DB classes o helpers. Los 2 de tokens son pre-señal del sub-proyecto #1.

---

## Objetivo

Dejar el proyecto en este estado al cerrar:

- [ ] `npm test` verde al 100% (0 fallos)
- [ ] `npx tsc --noEmit` limpio (0 errores)
- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin warnings nuevos
- [ ] 0 archivos dirty en `git status`
- [ ] Sentry sin errores nuevos por 7 días post-deploy a staging
- [ ] CI gate activado: PR rojo bloquea merge

---

## Estrategia de resolución en 4 fases

### Fase 1 — Cleanup de workspace (HOY, ya en ejecución)

Cleanup de los 101 archivos dirty:

- [x] Agregar `/*.png` y `.playwright-mcp/` a `.gitignore`
- [x] Borrar 85 screenshots exploratorios
- [x] Untrack `.claude/.state`, `.claude/learning`, `.claude/session-state.json`
- [ ] Instalar deps (`npm install` — node_modules estaba vacío)
- [ ] Commit atómico de cada bloque temático restante (docs, hooks, data, tests, plans, baseline)

**Done cuando:** `git status` limpio (0 archivos dirty).

### Fase 2 — Arreglar errores TSC (día 1-2)

Agrupar los 83 errores por causa raíz y arreglar en orden de impacto:

1. **API tests con arity** (40 errores, 5 archivos de test) — arreglar la signature esperada o el llamado
2. **tools/mcp-bodega/src/index.ts** (14 errores) — si es tool de dev, quizás se puede excluir del tsc mainline
3. **marketplace/search/suggestions/route.ts** (13 errores de tipos) — revisar tipos
4. **marketplace cross-store-combos** (6+4 errores) — refactor probablemente incompleto
5. **TiendaSectionsWrapper** (2 errores) — props mismatch

**Done cuando:** `npx tsc --noEmit` retorna exit 0 con output vacío.

### Fase 3 — Arreglar tests rojos (día 2-4)

Con TSC verde, los tests arityerror deberían arreglarse en cascada. Quedan:

1. `admin-module-standards.test.ts` (19 fallos) — leer el test, ver qué regla arquitectural viola el código, decidir: arreglar código o ajustar regla
2. `api-activity-log.test.ts`, `api-notes.test.ts`, `api-message-templates.test.ts` (26 fallos) — probablemente signature
3. `image-placeholders.test.ts` (2 fallos) — revisar fixture
4. **Componentes con tokens hardcodeados** (2 fallos de `ProductGallery` y `ProductVariantSelector`):
   - **Opción A:** migrar `border-[#00B4A6]` → `border-primary` en esos 2 componentes (barato, consistente con sub-proyecto #1)
   - **Opción B:** ajustar el test para aceptar el hex
   - **Recomendación:** Opción A — ya estamos en zona, y es 1 línea por componente

**Done cuando:** `npm test` retorna exit 0 con `0 failed`.

### Fase 4 — CI gate y estabilización (día 4-5)

1. **Verificar `next.config.ts`** — confirmar `ignoreBuildErrors: false` está activo (memoria indica que ya está)
2. **Pre-commit hook** — ya existe (lint-staged + tsc + vitest)
3. **CI gate en Vercel / GitHub** — si PR falla tsc o tests, bloquea merge
4. **Build baseline re-capturado** — `npm run build` exitoso y bundle analyzer guardado en `reports/baseline/2026-04-16-final/`
5. **Deploy a staging** y observar Sentry 48h

**Done cuando:** CI bloquea PRs rojos y staging está limpio 48h.

---

## Riesgos específicos de este sub-proyecto

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Arreglar signature rompe más tests en cascada | Media | Arreglar en 1 PR por archivo, verificar con `npm test <file>` antes de commit |
| `admin-module-standards.test.ts` pide cambios arquitecturales grandes | Alta | Si los 19 fallos piden refactor >100 LOC, escalar como tarea separada (ADR nuevo) |
| Tests flakey aparecen al arreglar los hard-fail | Media | Correr test 3 veces, si flakey → cuarentena con `.skip` + issue |
| Cambios tocan zona de peligro (`checkout/**`) | Media | Squad checkout + e2e obligatorio antes de commit |
| node_modules corrupto impide arranque | Baja | `npm ci` en vez de `npm install` si continúa |

---

## Ordenamiento dentro del sub-proyecto

```
Fase 1 (cleanup)
   ↓
Fase 2 (TSC) ← si TSC limpia, ~50% de tests fallando también se arreglan
   ↓
Fase 3 (tests restantes)
   ↓
Fase 4 (CI gate + staging)
```

**Duración estimada:** 5 días de trabajo concentrado (1 sprint).

---

## Criterios de done del sub-proyecto

- [ ] TSC: 0 errores
- [ ] Tests: 0 rojos, 100% pasando
- [ ] Build: exitoso
- [ ] Lint: 0 warnings nuevos
- [ ] `git status`: limpio
- [ ] CI gate activo bloqueando PRs rojos
- [ ] Baseline final en `reports/baseline/2026-04-16-final/`
- [ ] ADR "Política de tests y gates" creado (documenta la política)
- [ ] Roadmap maestro actualizado: marcar #3 como `✅ Completado`
- [ ] Sentry 48h en staging sin errores nuevos relacionados

---

## Próximo paso tras este sub-proyecto

Pasar al **Sub-Proyecto #1 — Design System lockdown**. Los 2 tests ya migrados a `border-primary` son el pre-trabajo que valida que la migración funciona.

---

## Changelog

- **2026-04-16** — Draft inicial con baseline capturado.
