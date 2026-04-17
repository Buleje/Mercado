---
name: visual-regression
description: Captura screenshots baseline de rutas clave con Playwright, los guarda como referencia, y los compara contra estado actual para detectar regresiones visuales. Usar cuando Brandon diga "visual regression", "comparar visual", "snapshot test", "antes de mergear UI", o antes/después de cambios grandes de CSS/design tokens.
user-invocable: true
model: sonnet
context: fork
---

# /visual-regression — Visual diff con Playwright

Captura screenshots de rutas clave del sitio (localhost o preview de Vercel) en 3 breakpoints
(mobile, tablet, desktop), los guarda en `reports/visual-baseline/`, y en corridas posteriores
compara pixel-a-pixel contra el baseline.

## Cuándo usar

| Trigger | Acción |
|---|---|
| Antes de mergear cambios de `lib/design-tokens.ts` | Capturar baseline + comparar post-merge |
| Refactor de componentes compartidos (Button, Modal, Card) | Verificar 0 regresión en todas las rutas que los usan |
| Cambios en `globals.css` o Tailwind config | Mandatorio |
| Deploy a staging | Diff contra producción |
| Sub-proyecto #1 (Design System Lockdown) por layer | Gate obligatorio por PR |

## Rutas base (configurables)

Por defecto captura estas 12 rutas en 3 breakpoints = 36 screenshots:

```
/ (landing)
/marketplace
/marketplace/p/1 (producto)
/t/san-martin (tenant store)
/t/san-martin/checkout
/admin (dashboard)
/admin/ventas-caja
/admin/inventario
/admin/clientes
/admin/mi-plata
/superadmin
/cuenta
```

## Flujo

### Modo BASELINE (primera vez o reset)

```bash
# El skill ejecuta:
npx playwright install chromium  # si no está
node .claude/skills/visual-regression/capture.mjs --mode baseline
# Guarda en reports/visual-baseline/YYYY-MM-DD/
# Formato: <ruta-slug>__<breakpoint>.png
```

### Modo DIFF (comparar contra baseline)

```bash
node .claude/skills/visual-regression/capture.mjs --mode diff
# Captura current + compara vs baseline con pixelmatch
# Output: reports/visual-baseline/diff-<timestamp>/
#   - per-route diff images
#   - report.json con % de pixeles diferentes por ruta
# Exit code != 0 si alguna ruta supera threshold (default 0.5%)
```

## Configuración

`.claude/skills/visual-regression/config.json`:

```json
{
  "baseUrl": "http://localhost:3000",
  "routes": ["/", "/marketplace", "/admin", ...],
  "breakpoints": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "threshold": 0.005,
  "ignoreRegions": [
    { "route": "/admin", "selector": ".current-time" }
  ],
  "authCookies": "path/to/admin-session.json"
}
```

## Output ejemplo

```
reports/visual-baseline/
├── 2026-04-16/ (baseline)
│   ├── landing__mobile.png
│   ├── landing__tablet.png
│   ├── ...
│   └── MANIFEST.json
└── diff-2026-04-17T10-00/
    ├── landing__mobile.diff.png  (red highlights in changed pixels)
    ├── report.json
    └── REGRESSIONS.md  (solo rutas > threshold)
```

## Integración con CI

Opcional: correr en GitHub Actions pre-merge. Si hay regresión > threshold,
bloquea merge. Baseline se actualiza manualmente via `--mode baseline-update`.

## Anti-patrones

- ❌ Capturar baseline con datos mock diferentes entre runs (usar fixture fijo o `ignoreRegions`)
- ❌ Threshold 0% (genera falsos positivos por antialiasing de fonts)
- ❌ Comparar screenshots con animaciones activas (agregar `prefers-reduced-motion` o esperar `animationend`)
- ❌ Olvidar auth cookies para rutas /admin (screenshots vacíos)

## Dependencias

- `playwright` (ya instalado)
- `pixelmatch` (se instala al primer uso)
- `pngjs` (se instala al primer uso)

## Invocación

```
/visual-regression                       # diff vs último baseline
/visual-regression baseline              # nuevo baseline
/visual-regression baseline-update       # actualizar baseline con current (tras verificar que el cambio es intencional)
/visual-regression diff --route /admin   # solo una ruta
```

## TODO al primer uso

Este skill requiere `capture.mjs` que aún no existe. Al invocarse por primera vez,
Claude debe:
1. Verificar que Playwright está instalado
2. Crear `.claude/skills/visual-regression/capture.mjs` con el script completo
3. Instalar pixelmatch + pngjs si faltan
4. Correr modo baseline

El script es simple (<100 líneas) — Claude lo genera en el primer run.
