---
name: bulk-safe-migrate
description: Wrapper de bulk-migration scripts que evita los 3 bugs clasicos descubiertos en ADR-075 — shadow primitives, use-client desplazamiento, y lint-staged OOM. Uso cuando hay que migrar >50 archivos con imports o className transformations, o antes de correr migrate-to-ds / migrate-decorative-colors / cualquier codemod.
user-invocable: true
model: sonnet
allowed-tools: Read, Bash, Grep, Glob
---

# Skill: bulk-safe-migrate

## Los 3 bugs clasicos de bulk migrations en Buleje

Esta sesion (2026-04-17) nos enseno que correr scripts codemod sobre 100+
archivos sin preparacion causa:

### Bug 1 — `"use client"` desplazado por auto-imports

Cuando el script inyecta `import { X } from "..."` al top de archivos, el
directive `"use client"` baja a linea 2+ y Next.js rompe con 500.

**Check:** antes de aplicar, grep `^"use client"` + verificar imports.
**Fix post-hoc:** `node scripts/fix-use-client-position.mjs`.

### Bug 2 — lint-staged SIGKILL con >100 archivos

eslint-workers saturan memoria (~4GB default) con ~500 archivos staged.
SIGKILL → `--no-verify` forzado = gates sin cobertura.

**Check:** `NODE_OPTIONS="--max-old-space-size=8192"` ya esta en pre-commit
hook (post 2026-04-17). Para bulk extra-pesado usar `chunked_commit`.

### Bug 3 — Shadowed primitives (refactor no se refleja)

Migrar primitive del DS externo NO surte efecto si hay copia local shadow en
un modulo grande (ej. SparklineKPICard en PrestamosModule.tsx).

**Check:** `skill shadow-detector <PrimitiveName>` ANTES del bulk.

## Proceso seguro (7 pasos)

```
1. BASELINE pre: reports/baseline/<date>-<sprint>/
   - tsc-pre.txt, lint-pre.txt, dirty-pre.txt

2. SHADOW check: invocar shadow-detector para cada primitive
   target. Si detecta shadow, fixear antes del bulk.

3. DRY-RUN: script con flag --dry-run, reportar archivos + conteo.
   Si > 100 archivos, considerar chunking por directorio.

4. APPLY: con HUSKY_RUN_POSTCOMMIT_TESTS=0 y NODE_OPTIONS 8GB ya
   en pre-commit.

5. USE-CLIENT fix: grep + node scripts/fix-use-client-position.mjs.
   Obligatorio si el script toca archivos con "use client".

6. TSC gate: npx tsc --noEmit, debe pasar 0 errors. Si falla,
   investigar antes de commit.

7. VISUAL VERIFY: node scripts/visual-verify-admin-focused.mjs, comparar
   contra baseline pre. Si hay regresiones, revert hasta estable.
```

## Cuando invocar (reemplaza al usuario planificar manualmente)

- Brandon dice: "bulk migrate X", "codemod Y", "migracion masiva", "refactor
  N archivos", "aplica a todo el admin".
- Antes de ejecutar cualquier script en `scripts/migrate-*.mjs` con
  --apply flag.
- Cuando ultra-impact va a tocar >50 archivos con transformacion
  sintactica.

## Output contract

Al terminar reporta:
- Archivos cambiados (count)
- Baseline pre vs post: tsc, lint, dirty
- Use-client fixes aplicados (N archivos)
- Visual regressions detectadas (si aplica)
- Commits creados (list)
- Bypasses HUSKY (con justificacion, deberian ser 0)
