# ADR-069: Design System Governance (ADR-068 enforcement)

**Estado:** Aceptado
**Fecha:** 2026-04-17
**Contexto ADR:** Extiende ADR-068 (armonia estricta "no paleta payaso").

---

## Contexto

ADR-068 definio la regla "no paleta payaso" — admin y tienda publica deben usar tokens del sistema de diseno (surface-sunken, text-primary, data-success/warning/error) en lugar de colores arbitrarios de Tailwind (indigo/violet/purple/pink/emerald/etc).

Despues de aplicar la regla manualmente (Olas S-V, ~30 archivos), detectamos que el codigo generado por IA y los merges nuevos la rompian silenciosamente. Sin enforcement automatico, la regla decae.

## Decision

Implementamos una pila de governance de 4 capas que hace imposible introducir violaciones:

### 1. Guardian de lint (pre-commit)

Archivo: `scripts/lint-design-tokens.ts`

- Escanea `components/{admin,store,ui-system,customer}` y `app/t` por patrones prohibidos.
- Reglas tipadas con severidad `error` o `warning`.
- Whitelist estricta para gradientes funcionales (AdminTabBar scroll fade, BannerEditor image overlay).
- Corre en pre-commit hook (husky) Y en lint-staged (doble gate).
- Exit 1 = violaciones encontradas, exit 0 = limpio.

Reglas actuales (todas severity `error`):
- `no-decorative-gradient` — `bg-linear-to-* from-{paleta-prohibida}-\d+`
- `no-legacy-gradient-prefix` — `bg-gradient-to-*` (Tailwind v3)
- `no-colored-shadow` — `shadow-{paleta}-\d+`
- `no-decorative-text-color` — `text-{indigo|violet|purple|pink|fuchsia|rose}-\d+`

### 2. Migrador bulk (one-shot + ad-hoc)

Archivo: `scripts/migrate-decorative-colors.ts`

- Aplica regex patterns que traducen paleta decorativa a tokens.
- 15+ reglas: badges light/dark, tinted panels, text colors, borders, rings, hover, focus, group-hover.
- Modos: default (dry-run), `--apply`, `--stats`.
- Usado una vez para barrer 766 reemplazos en 175 archivos. Disponible para futuras olas.

NPM aliases:
- `npm run lint:design:fix` — dry run del migrador
- `npm run lint:design:fix:apply` — aplica cambios

### 3. Componentes unificados (eliminar duplicacion)

Archivos: `components/admin/shared/PrimaryButton.tsx`, `components/admin/shared/IconBadge.tsx`

- `<PrimaryButton>`: 4 variantes (primary/secondary/ghost/danger), 3 tamanos, `asChild` (Radix Slot). Reemplaza ~29 patrones duplicados.
- `<IconBadge>`: 4 tamanos, 2 shapes, 5 intents. Reemplaza ~23 patrones de spans/divs con tokens manuales.
- Ambos tienen Storybook stories con todas las variantes.

### 4. Documentacion viva (Storybook)

- `PrimaryButton.stories.tsx` — 11 stories, autodocs.
- `IconBadge.stories.tsx` — 7 stories, autodocs.
- Storybook ya instalado (`@storybook/nextjs ^8.6.18`). Chromatic snapshots sugeridos como siguiente paso.

## Consecuencias

### Positivas

- **Imposible regresion:** cada commit pasa por 2 gates (husky + lint-staged).
- **On-ramp rapida:** contributors nuevos ven los estandares en Storybook, no en docs.
- **Fix automatico:** `npm run lint:design:fix:apply` arregla 90% de violaciones en <2s.
- **Scope claro:** solo admin/store/ui-system/customer/app-t. Design-system demos y tests libres.
- **Metrica auditable:** `npm run lint:design` retorna `0 violations in N files`.

### Negativas / tradeoffs

- Whitelist requiere edicion manual del script cuando se agrega un gradiente funcional legitimo.
- Pre-commit hook anade ~2s al commit (mitigado: solo staged files).
- `asChild` en PrimaryButton requiere que el hijo acepte className via Radix Slot — hay un caso obscuro donde el hijo no hace spread de props.

### Bypasses autorizados

- `HUSKY=0 git commit` — hotfix productivo verdadero.
- `eslint-disable` — NO aplica aqui, el lint es un script separado, no regla ESLint.
- Editar whitelist en el script — se revisa en PR con justificacion.

## Implementacion

Commits de referencia:
- Ola V sweep manual (30 archivos, 0 gradientes)
- Ola W automatizacion (this ADR) — 175 archivos migrados, 0 errors + 0 warnings en 725 archivos escaneados.

## Criterio de elegibilidad para componentes shared

No todo patron duplicado pertenece a `PrimaryButton` o `IconBadge`. Casos donde **NO** migrar:

- Badges con `border-2` + `animate-ping` + rings complejos (ej. step markers con animacion "active").
- FABs con layout fixed posicional (`fixed bottom-6 right-6` + unread badges anidados).
- Toasts con layout y lifecycle especifico (fixed + auto-dismiss + slide animations).
- Componentes con intent fuera del catalogo (`bg-[var(--accent)]` mid-animation, etc.).

Para estos: dejar inline y evitar abstraer prematuramente. Regla general: si el caso requiere extender `PrimaryButton`/`IconBadge` con prop novedosa, probablemente no debe migrarse.

Sitios actualmente "opt-out" por complejidad (~16 patrones):
- `OrderTrackingTimeline` step markers (3 estados con animate-ping).
- `OnboardingChecklist` row (border-rule-base + text-tertiary cuando pending).
- `AIAssistant` chat headers (3 layouts distintos, lifecycle embebido).
- `AIFloatingButton` + `QuickActionsFab` (fixed-position FABs).
- `UndoToast` (slide + auto-dismiss).
- `QuickViewModal` variant buttons (cn + pricing inline).
- `UnifiedFilterChip` active state (elev-1 especifico).

Todos usan tokens (text-primary + surface-canvas) — no violan ADR-068, solo no entran en la abstraccion.

## Proximas iteraciones

- Chromatic snapshot testing en CI — ver `docs/design-system/CHROMATIC-SETUP.md`.
- ADR-070: typography tokens — **publicado 2026-04-17**.
- Extender scope a `app/admin` y `app/marketplace` si se crean componentes nuevos alli.
- POC workspace interno `@buleje/design-system` (ver `packages/design-system/` — en evaluacion).

## Referencias

- ADR-068 — regla armonia estricta original.
- CLAUDE.md regla 4 — tokens v4 + cacheLife.
- `C:\Users\Usuario\.claude\...\memory\project_design_lint_guardrail.md` — memoria cross-sesion.
