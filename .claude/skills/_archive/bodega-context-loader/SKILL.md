---
name: bodega-context-loader
description: Carga el contexto completo del proyecto Buleje al iniciar una nueva sesión o al cambiar de tarea. Lee ARCHITECTURE, TECH-DEBT, últimos commits, estado del sprint y checkpoints activos para dejar a Claude con todo el background antes de tocar código. Usar al arrancar sesión o cuando Brandon pida "contexto" o "ponte al día".
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
argument-hint: [modo-opcional=full|quick|area]
---

# bodega-context-loader — Arranque en frío con todo el contexto

Carga el contexto del proyecto Bodega en un solo comando. Elimina los "briefings" manuales cada vez que arrancamos una sesión nueva.

## Argumentos

- `$ARGUMENTS` — modo de carga. Valores:
  - `full` (default) — carga todo: arquitectura, tech debt, commits, plan activo, checkpoints
  - `quick` — solo últimos 10 commits + estado de tests + tasks pendientes
  - `area:<nombre>` — foco en un área (ej. `area:checkout`, `area:delivery`, `area:chat`)

## Pasos (modo `full`)

### 1. Anclaje arquitectónico

Leer en este orden:

```
CLAUDE.md                        (si no está ya en contexto)
docs/ARCHITECTURE.md             (primeras 400 líneas)
docs/ONBOARDING.md               (primeras 200 líneas)
docs/TECH-DEBT.md                (tabla completa)
docs/production-readiness.md     (si existe)
```

Si algún archivo no existe, seguir sin error y anotar en el reporte final.

### 2. Estado del código en vivo

```bash
cd bodega-san-martin
git log --oneline -15
git status --short
git branch --show-current
```

Identificar:

- ¿Hay cambios sin commitear?
- ¿En qué branch estamos?
- ¿Los últimos 15 commits qué tocaron? (temas recurrentes = sprint actual)

### 3. Sprint activo y planes

```bash
ls docs/plans/ 2>/dev/null
ls docs/adr/ 2>/dev/null | tail -5
```

Leer el plan más reciente en `docs/plans/` si existe.
Leer el ADR más reciente para ver la última decisión arquitectónica importante.

### 4. Zonas peligrosas y reglas críticas

Revisar (sin leer completo — solo confirmar que existen):

- `.claude/hooks/danger-zone.mjs` — lista de archivos protegidos
- `.github/PULL_REQUEST_TEMPLATE.md` — Definition of Done
- `.github/instructions/` — skills declarativas

### 5. Red de seguridad de tests

```bash
find __tests__ -name "*.test.ts" -o -name "*.test.tsx" | wc -l
ls e2e/*.spec.ts | wc -l
```

Reportar:

- Cantidad total de tests unitarios
- Cantidad de specs e2e
- Si hay `.husky/.last-test-run.FAILED` presente → tests rotos en el último post-commit

### 6. Checkpoints activos

```bash
ls docs/checkpoints/ 2>/dev/null
```

Si hay un checkpoint reciente, leerlo — ahí está el estado de trabajo pendiente.

### 7. Reporte final — formato obligatorio

Entregar UN SOLO mensaje con esta estructura (tablas cortas, estilo Feynman):

```markdown
## 📊 Contexto cargado — Buleje

### 🔖 Estado actual
| Dato | Valor |
|---|---|
| Branch | ... |
| Último commit | ... |
| Cambios sin commitear | N archivos |
| Tests unitarios | N |
| Tests e2e | N |
| Post-commit test anterior | ✅ / ❌ |

### 🎯 Sprint vigente (inferido de commits + planes)
- ...
- ...

### 🔥 Tech debt más caliente (top 3)
| # | Item | Impacto |
|---|---|---|
| 1 | ... | ... |
| 2 | ... | ... |
| 3 | ... | ... |

### ⚠️ Zonas peligrosas tocadas recientemente
- ...

### 🚨 Bloqueadores actuales (si los hay)
- ...

### ✅ Listo para trabajar en
- (sugerir 3 tareas concretas basadas en el estado)
```

## Modo `quick`

Solo pasos 2 (estado git) + 5 (tests). Reporte compacto — 5 líneas.

## Modo `area:<nombre>`

Pasos del modo full pero filtrando por área:

- `area:checkout` → también carga `components/checkout/README.md` + `__tests__/checkout/*` stats + últimas 5 commits con scope `checkout`
- `area:delivery` → carga `lib/db/delivery.db.ts` + `scripts/seed-delivery-demo.ts` + specs `delivery-*`
- `area:chat` → carga `lib/db/chat.db.ts` + `components/admin/ChatTab/` + `e2e/chat-flow.spec.ts`
- Otras áreas → intentar adivinar por nombre de carpeta

## Reglas del skill

- **No editar nada** — este skill es solo lectura
- **Entregar el reporte en español simple** (lenguaje Feynman como pide Brandon)
- **Si algún archivo clave no existe, anotarlo pero seguir** — nunca fallar silenciosamente
- **No repetir contenido que ya esté en CLAUDE.md** — solo sintetizar lo nuevo
- **Máximo 40 líneas en el reporte final** — contexto cargado ≠ paredes de texto
