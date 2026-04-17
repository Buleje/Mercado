# Chromatic Setup — Visual Regression Testing

**Contexto:** ADR-069 (governance) lista Chromatic snapshots como capa 5. Este doc tiene instrucciones paso-a-paso para activarlo cuando tengas el Project Token.

## Estado actual (preparado, no activo)

| Componente | Estado |
|---|---|
| `chromatic.config.json` | Listo con `onlyChanged`, `externals`, `zip` config |
| `.github/workflows/chromatic.yml` | Listo — corre en PR + push a master. Espera `secrets.CHROMATIC_PROJECT_TOKEN` |
| `npm run chromatic` script | Listo en `package.json`. Usa `$CHROMATIC_PROJECT_TOKEN` env |
| `chromatic@16.3.0` dep | Instalado como devDependency |
| Stories listas para snapshots | 34 stories (11 Button + 7 Badge + 9 Text + 6 Chip + 1 extra) |

## Pasos para activar

### 1. Crear proyecto en Chromatic (5 min)

1. Ir a https://www.chromatic.com (login GitHub).
2. "Add a project" → seleccionar repo `Buleje/bodega-san-martin`.
3. Copiar el `Project Token` (formato: `chpt_xxxxxxxxxxxx`).

### 2. Agregar secreto al repo GitHub

```bash
gh secret set CHROMATIC_PROJECT_TOKEN --body "chpt_xxxxxxxxxxxx"
```

Verifica:
```bash
gh secret list
# Deberia aparecer CHROMATIC_PROJECT_TOKEN
```

### 3. Primera corrida local (baseline)

Opcional pero recomendado — establece baseline antes del primer PR:

```bash
# Local dev (opcional — solo si quieres correr antes de pushear)
export CHROMATIC_PROJECT_TOKEN=chpt_xxxxxxxxxxxx

# Verifica que Storybook buildea sin errores
npm run build-storybook

# Primera corrida acepta todos los snapshots actuales como baseline
npx chromatic --project-token=$CHROMATIC_PROJECT_TOKEN --auto-accept-changes
```

Despues de esto, cualquier cambio visual en un PR genera diffs que revisar.

### 4. Validacion en PR

Haz un PR con cambio visual trivial (ej. texto de un Story). Deberias ver:
- Check en GitHub "Chromatic" corriendo.
- Link a Chromatic UI con las screenshots.
- Pass/Review status.

Si pasa, la capa 5 esta activa.

## Como interpretar resultados

| Status | Significado | Accion |
|---|---|---|
| **Pass** | 0 cambios visuales | PR merge-safe |
| **Review needed** | Diff detectado | Abrir Chromatic UI, aprobar si es cambio intencional o rechazar si es regresion |
| **Errors** | Storybook no renderiza la story | Fix en codigo antes de merge |

## Stories cubiertas (actualizado 2026-04-17)

- `Design System/PrimaryButton` — 11 stories
- `Design System/IconBadge` — 7 stories
- `Design System/Text` — 9 stories
- `Design System/Chip` — 6 stories
- Otros admin stories pre-existentes

Expansion sugerida despues del baseline:
- Admin modules (UnifiedKPITile, TodayHub, AdminInsightCard)
- Customer journey (OrderConfirmationCard, YapeQRCheckout, LoyaltyTierCard)
- Store widgets (LoyaltyWidget, FlashSaleBanner)

## Integracion con la pila de governance (ADR-069)

Chromatic completa la capa 5:

| Capa | Componente | Estado |
|---|---|---|
| 1 | Lint tokens (pre-commit) | ✓ Active |
| 2 | lint-staged (doble gate) | ✓ Active |
| 3 | Componentes shared + workspace | ✓ Active |
| 4 | Storybook stories | ✓ Active |
| 5 | **Chromatic snapshots** | **⏳ Pending API key** |

## Comandos de referencia

```bash
# Build storybook estatico
npm run build-storybook

# Correr chromatic local (requiere CHROMATIC_PROJECT_TOKEN en env)
npm run chromatic

# Primera corrida con auto-accept (solo la primera vez)
npx chromatic --project-token=$TOKEN --auto-accept-changes

# Correr solo stories que cambiaron (default en workflow)
npx chromatic --project-token=$TOKEN --only-changed
```

## Troubleshooting

- **"Storybook build failed"** → correr `npm run build-storybook` localmente para ver error especifico.
- **"Project token invalid"** → verificar formato `chpt_` y que el token sea del project correcto.
- **"Too many changes"** en PR grande → filtra con `--only-changed` o acepta baseline.
- **Workflow no corre en PR** → verificar que los paths cambiaron coincidan con el filter del workflow (`components/**`, `packages/design-system/**`, etc.).

## Costos

Chromatic tiene tier gratuito: 5,000 snapshots/mes. Con 34 stories × 10 PRs/mes × ~3 cambios visuales = 1,020 snapshots. Suficiente.

Si superas el limite, considerar:
- `--only-changed` activo (default).
- Reducir stories para snapshot (algunas pueden ser solo interactive, no visual).
- Upgrade a tier pagado (~$149/mes).

## Referencias

- Chromatic docs — https://www.chromatic.com/docs/
- ADR-069 — `docs/adr/069-design-system-governance.md`
- COMPONENTS.md — `docs/design-system/COMPONENTS.md`
- Workflow — `.github/workflows/chromatic.yml`
