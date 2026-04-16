# Programa de Optimización del Proyecto — Roadmap Maestro

**Fecha:** 2026-04-16
**Autor:** Brandon Buleje (con asistencia de Claude)
**Estado:** Aprobado por Brandon (Secciones 1, 2, 3)
**Tipo:** Master Roadmap (programa multi-spec)

---

## Contexto

Este documento es el **roadmap maestro** para un programa de optimización integral del proyecto Bodega San Martín. No es un spec técnico único — es la foto panorámica de 6 sub-proyectos secuenciales, cada uno con su propio ciclo `spec → plan → implementación`.

**Estado actual del proyecto cuando se redactó este roadmap:**

| Dimensión | Número | Observación |
|---|---|---|
| Componentes en `/components` | 146 | Duplicados probables |
| Carpetas en `/app` | 825 | 12 grupos de rutas |
| Archivos sin commit | 101 | Trabajo a medio terminar |
| Tests | Rojos | Último post-commit falló |
| Design tokens | Existen | `globals.css` con brand colors + dark mode |
| ADRs | 57 | Proyecto maduro |

---

## Sección 1 — Visión y Criterios de Éxito

### Visión en una frase

> Que cualquier persona que entre a cualquier página del proyecto sienta que está en el mismo producto, que todo funcione sin errores visibles, y que cada click tenga una respuesta visual intencional.

### Criterios de éxito medibles

| Dimensión | Métrica | Hoy | Meta al cerrar |
|---|---|---|---|
| Consistencia visual | Componentes usando tokens centralizados | ~30% estimado | ≥95% |
| Consistencia visual | Variantes de color hardcodeadas en JSX | Cientos | <20 casos justificados |
| Calidad | Tests pasando | Rojos | 100% verdes |
| Calidad | Errores TypeScript (`tsc --noEmit`) | Por medir | 0 |
| Calidad | Warnings de consola en dev | Por medir | 0 críticos |
| UX / animaciones | Páginas con presets de motion unificados | 0 | 100% de rutas públicas |
| UX / animaciones | Microinteracciones en CTAs críticos | Parcial | 100% |
| Duplicación | Componentes en `/components` | 146 | ≤100 |
| Performance | Lighthouse mobile en 5 rutas clave | Por medir | ≥85 |
| Performance | Bundle size de rutas públicas | Por medir | −20% vs baseline |
| Accesibilidad | axe-core violations en rutas públicas | Por medir | 0 críticas |

### Principios guía

| # | Principio | Qué significa en la práctica |
|---|---|---|
| 1 | Un solo idioma visual | Si hay 2 botones distintos para la misma acción, uno sobra |
| 2 | El código limpia antes de pintar | Sub-proyecto #3 va primero, no se pinta encima de tests rojos |
| 3 | Minimalismo Holded | Gris, sin emojis, rounded-lg, sin sombras decorativas |
| 4 | Medir antes y después | Sin baseline, no hay mejora demostrable |
| 5 | YAGNI duro | Si una mejora no afecta a >10% de usuarios ni limpia deuda real, se corta |
| 6 | Respetar lo que funciona | El design system tiene bases sólidas (teal #00B4A6, dark mode). Consolidamos, no reinventamos |

### Fuera de alcance (no-goals)

| Fuera | Razón |
|---|---|
| Rediseño de marca / logo | Es rebranding, no optimización |
| Nuevas features de negocio | Optimizamos lo que existe |
| Refactor de DB / Prisma schema | Tiene ADR-050 y otros en curso |
| Migración de stack | Sin beneficio claro |
| Rediseño de flujos de checkout | Zona de peligro, programa propio |
| Internacionalización (i18n) | Producto regional (Pucallpa) |

---

## Sección 2 — Los 6 Sub-Proyectos

Cada sub-proyecto es un proyecto independiente con su propio spec, plan e implementación.

### #3 — Error hunt & stabilization (va 1ro)

| Campo | Contenido |
|---|---|
| Objetivo | Dejar el proyecto en verde: 0 tests rojos, 0 errores TS, 0 warnings críticos, 0 archivos dirty |
| Problema | 101 archivos sin commit, tests fallando, `ignoreBuildErrors` recién cerrado |
| Entregables | Baseline de métricas; commits atómicos de los 101 dirty; tests en verde; bugs resueltos o documentados como deuda aceptada |
| Métricas (done) | `npm test` verde · `npx tsc --noEmit` sin errores · `npm run build` limpio · Sentry sin errores nuevos por 7 días |
| Depende de | Nada |
| Bloquea a | Todos los demás |
| Zonas de peligro | Puede tocar `checkout/**`, `orders.db.ts`, `auth/**` |
| Esfuerzo | 1-2 sprints |
| ADRs nuevos | "Política de tests y gates" |

### #1 — Design System lockdown (va 2do)

| Campo | Contenido |
|---|---|
| Objetivo | Un solo archivo de tokens al que todo componente apunte |
| Problema | Hex codes sueltos en JSX, rounded mezclados, Admin minimalista peleando con Marketing colorido |
| Entregables | `lib/design-tokens.ts` único; migración de componentes a tokens; `tailwind.config` alineado; contrastes WCAG AA; ADR "Design System v2". _Storybook queda como nice-to-have, NO bloquea el sub-proyecto — si se quiere, spec aparte._ |
| Métricas (done) | 0 hex hardcodeados en JSX · axe-core sin errores de contraste · Tailwind config con tokens unificados |
| Depende de | #3 |
| Bloquea a | #2, #6 |
| Zonas de peligro | `globals.css`, `tailwind.config`, todos los `/components/ui/**` |
| Esfuerzo | 1 sprint |
| ADRs nuevos | "Design tokens v2" |

### #2 — Animaciones & Micro-interacciones (va 3ro)

| Campo | Contenido |
|---|---|
| Objetivo | Una librería única de presets de motion |
| Problema | Cada componente con su propio `transition` ad-hoc |
| Entregables | `lib/motion/presets.ts` con 8-10 animaciones; hook `useMotion()`; migración; guía en Storybook; microinteracciones en CTAs críticos |
| Métricas (done) | 0 `duration`/`ease` inline · Todos los `<motion.div>` usan preset · `prefers-reduced-motion` respetado 100% |
| Depende de | #1 |
| Bloquea a | #6 |
| Zonas de peligro | Ninguna crítica |
| Esfuerzo | 1 sprint |
| ADRs nuevos | "Motion system" |

### #4 — Component dedupe (va 4to)

| Campo | Contenido |
|---|---|
| Objetivo | Reducir de 146 a ≤100 componentes consolidando duplicados |
| Problema | `CategoryCatalog` + `CategoryCatalogClient`, `BulejeLandingClient` + `BulejeLandingClientLoader`, múltiples skeletons |
| Entregables | Inventario; matriz de uso; plan de consolidación; ejecución; borrado de duplicados |
| Métricas (done) | ≤100 componentes · 0 componentes no usados · Storybook como fuente de verdad |
| Depende de | #1, #2 |
| Bloquea a | #6 |
| Zonas de peligro | Todo `/components/**` (sin tocar lógica) |
| Esfuerzo | 1-2 sprints |
| ADRs nuevos | "Component library v2" |

### #5 — Performance (va 5to)

| Campo | Contenido |
|---|---|
| Objetivo | Lighthouse mobile ≥85 en 5 rutas clave, bundle −20% |
| Problema | Bundle sin medir, imágenes sin optimizar, lazy loading parcial |
| Entregables | Bundle analyzer; imágenes a `next/image`; lazy boundaries; cache components; CI gate de Lighthouse |
| Métricas (done) | LCP <2.5s · CLS <0.1 · INP <200ms · Bundle −20% vs baseline |
| Depende de | #4 |
| Bloquea a | #6 |
| Zonas de peligro | `next.config.ts`, layouts, rutas con `"use cache"`. **Respetar ADR-019: Next 16 sin segment configs — solo `"use cache"` + `cacheLife()` + `cacheTag()`** |
| Esfuerzo | 1 sprint |
| ADRs nuevos | "Performance budgets y gates" |

### #6 — Page-by-page UX polish (va 6to)

| Campo | Contenido |
|---|---|
| Objetivo | Cada zona en estado "producción premium" con su lente de usuario |
| Problema | Cada audiencia con tratamiento distinto sin unidad |
| Entregables | Pase por zona: Marketing, Tienda, Admin, Delivery, Superadmin, Supplier, SaaS/onboarding, CMS |
| Métricas (done) | 0 regresiones nuevas en axe-core · Lighthouse mobile ≥85 en todas las zonas auditadas · Walkthrough con screenshots antes/después · checklist de UX por zona cerrado al 100% |
| Depende de | Todos |
| Bloquea a | Nada |
| Zonas de peligro | Todas — con chasis firme, riesgo bajo |
| Esfuerzo | 2-3 sprints |
| ADRs nuevos | 1 por zona con decisión de UX notable |

### Resumen

| # | Sub-proyecto | Sprints | Depende | Bloquea |
|---|---|---|---|---|
| 3 | Error hunt | 1-2 | — | Todos |
| 1 | Design System | 1 | #3 | #2, #6 |
| 2 | Animaciones | 1 | #1 | #6 |
| 4 | Dedupe | 1-2 | #1, #2 | #6 |
| 5 | Performance | 1 | #4 | #6 |
| 6 | Polish | 2-3 | Todos | — |

**Total estimado:** 7 a 10 sprints ≈ 3.5 a 5 meses.

---

## Sección 3 — Secuencia, Dependencias y Riesgos

### Mapa de flujo

```
#3 ERROR HUNT → #1 DESIGN SYSTEM → #2 ANIMACIONES → #4 DEDUPE → #5 PERFORMANCE → #6 POLISH
```

### Oportunidades de paralelismo con worktrees

| Par en paralelo | Cuándo | Riesgo | Gate de merge |
|---|---|---|---|
| #1 + primer paso de #2 | Cuando #1 tenga tokens de motion (día 3) | Bajo | Storybook tokens alineados |
| #5 baseline + #4 | Bundle analyzer antes de dedupe | Bajo | Reporte guardado en `reports/` |
| #6 por zona (hasta 3 zonas) | Tras terminar #5 | Medio (merges) | 1 PR por zona |

### Matriz de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Romper checkout en #4 | Media | Crítico | Squad checkout + e2e obligatorio + canary 5% |
| Regresión visual en #1 | Alta | Medio | Storybook snapshot tests + visual diff CI |
| Pérdida de performance en #6 | Media | Alto | Lighthouse CI gate configurado en #5 |
| Scope creep | Alta | Alto | YAGNI escrito + revisión agresiva de PR |
| Rotación de prioridades | Media | Alto | Cada sub-proyecto entrega valor independiente |
| Tests flakey en #3 | Alta | Medio | Lista de flakey, cuarentena intermitentes |
| Conflicto con Centro de Comandos IA | Media | Medio | Congelar tokens de IA hasta #1 terminado |

### Plan de rollback por sub-proyecto

| Sub-proyecto | Cómo se revierte | Impacto |
|---|---|---|
| #3 Error hunt | `git revert` en commits atómicos | Bajo |
| #1 Design System | PR atómico por archivo + `git revert` quirúrgico (NO feature flag runtime — complejidad innecesaria para 1 developer) | Bajo |
| #2 Animaciones | `prefers-reduced-motion: reduce` default | Bajo |
| #4 Dedupe | PR separado por consolidación | Medio |
| #5 Performance | CI gate verde obligatorio | Bajo |
| #6 Polish | Por zona, 1 PR | Bajo |

### Gobernanza

| Artefacto | Propósito | Ubicación |
|---|---|---|
| Roadmap maestro (este doc) | Referencia viva | `docs/superpowers/specs/2026-04-16-programa-optimizacion-proyecto-design.md` |
| Spec por sub-proyecto | Diseño detallado | `docs/superpowers/specs/YYYY-MM-DD-<sub>-design.md` |
| Plan de implementación | Pasos técnicos | `docs/superpowers/plans/YYYY-MM-DD-<sub>-plan.md` |
| ADR por sub-proyecto | Decisión técnica | `docs/adr/NNN-<sub>.md` |
| Baseline metrics | Antes / después | `reports/baseline/2026-04-16/` |
| Dashboard de avance | Estado del programa | Actualizar este roadmap al cerrar cada sub-proyecto |

### Checklist de kickoff

- [ ] Commit atómico de los 101 archivos dirty por bloques temáticos
- [ ] Baseline: `npx tsc --noEmit > reports/baseline/tsc.txt`
- [ ] Baseline: `npm test > reports/baseline/test.txt`
- [ ] Baseline: Lighthouse mobile en 5 rutas clave
- [ ] Baseline: `npm run analyze` para bundle size
- [ ] **Gate e2e de checkout ANTES de cualquier commit en `checkout/**`, `orders.db.ts` o `auth/**`** (regla dura durante #3 por ser zona de peligro)
- [ ] Branch `programa/optimizacion-master` con roadmap committeado
- [ ] Issues en GitHub o notas por sub-proyecto

---

## Estado del programa

| # | Sub-proyecto | Estado | Baseline capturado | Spec | Plan | PR |
|---|---|---|---|---|---|---|
| 3 | Error hunt | En preparación | En curso | pendiente | pendiente | — |
| 1 | Design System | Pendiente | — | — | — | — |
| 2 | Animaciones | Pendiente | — | — | — | — |
| 4 | Dedupe | Pendiente | — | — | — | — |
| 5 | Performance | Pendiente | — | — | — | — |
| 6 | Polish | Pendiente | — | — | — | — |

**Última actualización:** 2026-04-16 — Roadmap aprobado, arrancando baseline de #3.

---

## Próximo paso inmediato

Arrancar sub-proyecto #3 con:
1. Capturar baseline (`tsc`, `test`, `build`, Lighthouse, bundle)
2. Commits atómicos de los 101 archivos dirty
3. Brainstorming → spec → plan → implementación del #3
