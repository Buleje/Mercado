---
name: review
description: Revisar los cambios del branch actual antes de merge o PR. Verifica calidad de codigo, seguridad y convenciones del proyecto.
disable-model-invocation: false
user-invocable: true
context: fork
agent: general-purpose
allowed-tools: Bash, Read, Grep, Glob
---

# Review — Buleje

Revisar los cambios del branch actual antes de hacer merge o PR en el proyecto Buleje.

## Pasos

### 1. Ver diferencias contra master

```bash
cd buleje
git diff master...HEAD
git log --oneline master..HEAD
git diff --stat master...HEAD
```

Analizar:
- Cantidad de archivos modificados
- Lineas agregadas/eliminadas
- Modulos afectados

### 2. Verificar calidad (lint + build + tests)

```bash
cd buleje
npm run lint
npm run build
npm run test
```

Registrar resultado de cada paso.

### 3. Checklist de seguridad

Revisar TODOS los archivos modificados y verificar:

- [ ] **No hay secrets en el codigo** — buscar `.env`, API keys, tokens, passwords hardcodeados
- [ ] **tenantId en todas las queries** — cada consulta a la DB debe filtrar por tenantId
- [ ] **safeParse() en lugar de .parse()** — Zod debe usar safeParse() para control de errores
- [ ] **DB classes de lib/db/** — nunca Prisma directo, siempre usar las clases de `lib/db/*.db.ts`
- [ ] **force-dynamic en route handlers** — `export const dynamic = "force-dynamic"` en todos los route handlers
- [ ] **Fire-and-forget** — `logActivity().catch(() => {})` y `sendNotification().catch(() => {})` no deben bloquear

### 4. Verificar convenciones adicionales

- [ ] No se calculan totales en el cliente (recomputar server-side)
- [ ] Commits siguen Conventional Commits
- [ ] No hay `console.log` de debug sueltos
- [ ] Los imports estan organizados
- [ ] No hay archivos `.env*` en los cambios

### 5. Buscar patrones problematicos

Usar Grep para buscar en los archivos modificados:

```bash
# Archivos modificados
git diff --name-only master...HEAD
```

Buscar en esos archivos:
- `prisma.` seguido de operaciones directas (sin usar DB classes)
- `.parse(` en lugar de `.safeParse(`
- `console.log` sueltos
- Secrets o tokens hardcodeados
- `await logActivity(` o `await sendNotification(` sin `.catch`

## Reporte final

Presentar tabla resumen con estado por categoria:

| Categoria | Estado | Notas |
|-----------|--------|-------|
| Lint | (completado/fallido) | ... |
| Build | (completado/fallido) | ... |
| Tests | (completado/fallido) | X passed, Y failed |
| Seguridad | (aprobado/advertencia/critico) | Detalle de hallazgos |
| Convenciones | (aprobado/advertencia/critico) | Detalle de hallazgos |
| Patrones problematicos | (limpio/encontrados) | Lista de hallazgos |

## Veredicto

Al final del reporte, emitir un veredicto claro:
- **APROBADO** — listo para merge/PR
- **APROBADO CON OBSERVACIONES** — puede mergearse pero tiene advertencias
- **RECHAZADO** — tiene problemas criticos que deben resolverse
