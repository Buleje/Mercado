---
applyTo: "**/.gitignore,**/.husky/**,**/.github/**"
---

# Git Workflow — Buleje

## Ramas

```bash
main          # Producción — deploy automático a Vercel
feat/nombre   # Features nuevas
fix/nombre    # Bugfixes
chore/nombre  # Mantenimiento (deps, config)
```

## Convención de commits (Conventional Commits)

```bash
feat: agregar tab de métricas de inventario
fix: corregir campo expiryDate en modelo Batch
chore: actualizar dependencias de Prisma
refactor: extraer StepBar de CheckoutModal
test: agregar tests e2e para flujo de checkout
docs: actualizar CLAUDE.md con nueva arquitectura
```

## Flujo por tarea

```bash
# 1. Nueva rama desde main actualizado
git checkout main && git pull
git checkout -b feat/nombre-de-la-tarea

# 2. Trabajo + commits frecuentes
git add -p   # Agregar cambios específicos (no git add -A sin revisar)
git commit -m "feat: descripción del cambio"

# 3. Antes de hacer PR
npm run lint && npm run build && npm run test

# 4. Push y PR
git push -u origin feat/nombre-de-la-tarea
gh pr create --title "feat: ..." --body "## Qué cambia\n..."

# 5. Merge via PR (no directo a main)
```

## CI/CD configurado

```yaml
# .github/workflows/ci.yml
# Corre en cada PR:
# - npm run lint
# - npm run build (incluye prisma generate)
# - npm run test
# Deploy a Vercel es automático en merge a main
```

## .gitignore — qué no commitear

```
.env.local          # Variables locales con secrets
.env*.local         # Cualquier variante
node_modules/       # Dependencies
.next/              # Build de Next.js
local-data/         # Datos locales de desarrollo
```

## Gotchas

- **`git add -A` en proyectos grandes** — puede incluir archivos `local-data/` o `.env.local` accidentalmente
- **Merge directo a main** — evitar; siempre PR para tener CI check
- **Schema de Prisma en PR** — revisar que la migración esté incluida junto con el cambio de schema
- **Conflicts en package-lock.json** — resolver siempre con `npm install` después del merge

## Checklist antes de PR

- [ ] `npm run lint` sin errores
- [ ] `npm run build` exitoso
- [ ] `npm run test` pasan
- [ ] Sin archivos `.env.local` o secrets staged
- [ ] Migración de Prisma incluida si hay cambios en schema
