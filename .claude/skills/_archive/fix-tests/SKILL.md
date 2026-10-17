---
name: fix-tests
description: Arregla tests fallando en batch. Lee errores, diagnostica causa raiz, arregla, verifica. Usar cuando hay tests rojos bloqueando CI.
user-invocable: true
model: sonnet
allowed-tools: Bash, Read, Edit, Grep
argument-hint: "[all|file-name|batch N]"
---

# /fix-tests — Reparar Tests en Batch

## Comandos
- `/fix-tests all` — arregla todos los tests fallando
- `/fix-tests [archivo]` — arregla un archivo específico
- `/fix-tests batch 10` — arregla los primeros 10

## Algoritmo

### 1. Diagnosticar
```bash
npm run test 2>&1 | grep "FAIL" | head -N
```

### 2. Por cada test fallando
```bash
npx vitest run __tests__/[archivo] 2>&1 | tail -40
```

### 3. Clasificar el error

| Error | Causa probable | Fix |
|---|---|---|
| `Cannot read properties of undefined` | Mock incompleto o firma cambió | Actualizar mock para match nueva firma |
| `Expected N arguments, got M` | Parámetro agregado/quitado | Agregar el argumento faltante al call |
| `expected X to be Y` | Lógica cambió | Actualizar el expected value |
| `mock not called` | Import path cambió | Actualizar el vi.mock path |
| `Sentry is not defined` | console.error → Sentry sin mock | Agregar `vi.mock("@sentry/nextjs")` |

### 4. Arreglar y verificar
```bash
# Edit the test file
# Re-run
npx vitest run __tests__/[archivo]
```

### 5. Continuar hasta batch completado

## Reglas
1. NUNCA borrar un test — arreglarlo
2. NUNCA cambiar el código fuente para que el test pase — arreglar el TEST
3. Si el test testea comportamiento que cambió intencionalmente → actualizar el expected
4. Si no puedes arreglar en 3 intentos → marcar con `test.skip` y reportar
5. Verificar que tests arreglados pasan: `npx vitest run [archivo]`
