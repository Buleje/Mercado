# Sub-Proyecto #1 — Design System Lockdown

**Fecha:** 2026-04-16
**Autor:** Brandon Buleje (con asistencia de Claude Opus 4.7)
**Estado:** Draft — listo para ejecución
**Parent:** [Roadmap maestro](2026-04-16-programa-optimizacion-proyecto-design.md)
**Depende de:** Sub-proyecto #3 (Error Hunt) — al 90%+ cerrado

---

## Baseline capturado

| Métrica | Valor hoy | Meta |
|---|---|---|
| Hex codes hardcoded en JSX (`border-[#`, `bg-[#`, `text-[#`, etc.) | **1898** | **<100** (solo casos justificados en comentario) |
| `dark:` classes totales | **22875** | **~12000** (admin zona forzada a light; store/public conserva dark mode) |
| Archivos con mayor hex-debt | PrestamosModule (48), NotasCredito (43), Cotizaciones (41), Contratos (40), negocios/page (36) | Top 5 → 0 hex en JSX |
| TSC errors | 0 (post #3) | 0 (mantener) |
| axe-core violations de contraste | Por medir | 0 críticas |

## Objetivo

Un archivo `lib/design-tokens.ts` único al que todo componente apunte. Cambiar 1 línea = repintar toda la app. Admin forzado a light mode sin `dark:`. Store/público conserva dark mode controlado por tokens.

## Principios (no-negotiables)

1. **Tokens centralizados** — `lib/design-tokens.ts` + Tailwind config como única fuente de verdad
2. **Semántica sobre estilo** — `border-primary` no `border-[#00B4A6]`
3. **Admin minimalista** — forced light, `space-y-4`, sin emojis decorativos, estilo Holded
4. **Store/público conserva dark mode** — tokens `--brand-primary-dark` para cuando aplique
5. **Zero regresión visual** — Storybook (opcional) o Playwright visual diff antes/después
6. **YAGNI duro** — no crear tokens para valores usados <3 veces

## Entregables

### 1. `lib/design-tokens.ts` (nuevo)

```typescript
export const tokens = {
  color: {
    primary: {
      DEFAULT: "#00B4A6",     // Alegra Teal
      dark:    "#009690",     // hover/active
      light:   "#33C4B8",
      bright:  "#00D4C8",     // accent
    },
    secondary: {
      DEFAULT: "#f97316",     // Orange 500
      dark:    "#ea580c",
    },
    danger:  "#ef4444",
    success: "#10b981",
    warning: "#f59e0b",
    info:    "#0ea5e9",
  },
  spacing: {
    moduleStack: "space-y-4",   // admin unified modules
    sectionStack: "space-y-6",  // marketing sections
  },
  radius: {
    default: "rounded-lg",
    card:    "rounded-xl",
    pill:    "rounded-full",
  },
  // ... etc.
};
```

Tailwind config lee esto y expone como classes (`border-primary`, `bg-primary`, etc.).

### 2. Migración en capas (5 PRs atómicos)

| Capa | Archivos estimados | Complejidad |
|---|---|---|
| **Capa A**: Tokens + tailwind.config | 2 | Baja |
| **Capa B**: Admin modules (top 5 + unified) | ~25 | Media (ya tocamos 17 en #3) |
| **Capa C**: Marketing / landing pages | ~15 | Media |
| **Capa D**: Store / público | ~40 | Alta (conserva dark mode, requiere cuidado) |
| **Capa E**: Components genéricos (buttons, modals) | ~30 | Alta (alto blast radius) |

### 3. Storybook (opcional — scope separado)

Marcado como **nice-to-have**, no bloquea el sub-proyecto. Si se quiere, ADR propio.

### 4. ADR "Design tokens v2"

Documenta la decisión de tokens vs hex, cómo se migra, y política de nuevos colores (tiene que pasar por un token antes de usarse).

### 5. Hook `hex-code-guard` (ya creado en esta sesión)

Emite warning cuando un Edit/Write introduce nuevo `border-[#...]` en JSX. Evita regresiones después de cerrar el sub-proyecto.

## Criterios de éxito (done numérico)

| Métrica | Hoy | Meta |
|---|---|---|
| Hex codes en JSX | 1898 | <100 justificados |
| `dark:` en `components/admin/unified/**` | >0 | 0 |
| `dark:` en `components/admin/**` (incluyendo shared) | >0 | 0 |
| `dark:` en store/público | conservado | conservado |
| Tailwind config con tokens | parcial | completo (sin colores hex inline) |
| `axe-core` contraste en rutas clave | por medir | 0 críticos |
| Tests pasando | 2835 | ≥2835 (no regresión) |
| TSC errors | 0 | 0 |

## Estrategia de paralelismo

```
Worktree A: Capa B (Admin)     — frontend-engineer + bsm-design-system
Worktree B: Capa C (Marketing) — frontend-engineer
Worktree C: Capa D (Store)     — frontend-engineer + checkout-specialist (por tocar carrito)
Main:       Capa A + Capa E    — Claude Opus (decisiones de tokens, componentes genéricos)
```

Tras completar cada worktree, merge en orden A → B → C → D → E con peer review cruzado.

## Riesgos y mitigación

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Regresión visual no detectada | Alta | Playwright screenshots antes/después por ruta |
| Rompe tests (border-primary assertion strings) | Media | Ya hicimos pre-work en #3 (ProductGallery, VariantSelector) |
| Dark mode roto en store | Alta | Capa D explícitamente conserva — testing manual + visual diff |
| Scope creep (agregar animaciones, refactor componentes) | Alta | YAGNI duro — cualquier mejora no-token se difiere a #2 o #4 |
| Conflictos merge entre worktrees | Media | Merge en orden A→B→C→D→E, un worktree activo a la vez si hay conflictos |

## Plan de rollback

Cada capa en PR atómico. Si una capa regresa, `git revert` del merge commit. Capa A (tokens) es la única semi-irreversible — protegida por pre-merge visual diff obligatorio.

## Próximo paso — ejecución

Esta sesión arranca:

1. **Capa A** parcial — `lib/design-tokens.ts` creado + migración en top 5 archivos (PrestamosModule, NotasCredito, Cotizaciones, Contratos, negocios/page) vía dispatch a frontend-engineer
2. **Checkout-squad** dispatcheado en paralelo para cerrar los 27 orders tests de #3
3. Resultado medido con `grep -rc 'border-\[#...' components/ app/`

## Changelog

- **2026-04-16** — Draft inicial post Sub-proyecto #3.
