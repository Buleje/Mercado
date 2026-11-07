---
name: self-heal
description: |
  Loop automático de auto-reparación cuando `npm test` o `npm run build` fallan.
  Diagnostica el error (grep + lectura del stack trace), aplica un fix mínimo,
  re-ejecuta. Hasta 3 intentos antes de escalar a humano.
  Usar cuando Brandon diga "auto-fix", "self-heal", "intenta repararlo solo",
  o cuando un comando de verificación devuelva exit code distinto de 0 dentro
  de una sesión autónoma.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, TaskCreate, TaskUpdate
argument-hint: "[comando-fallando | 'last' | 'lint' | 'build' | 'test']"
model: opus
---

# Self-Heal — Loop autónomo de reparación

Implementación de la **Regla de Oro de Autonomía** (CLAUDE.md regla 13): el sistema DEBE intentar repararse solo antes de pedir feedback.

## Cuándo dispararse

Automático tras exit code != 0 de: `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`, `npm run test:e2e`.

Manual: `/self-heal [comando]` o `/self-heal last`.

## Algoritmo — máximo 3 intentos

```
intento ← 1
mientras intento ≤ 3 y comando devuelva error:
    1. capturar stdout + stderr completos
    2. extraer: tipo de error (TS####, ESLint rule, Vitest assertion, build error), archivo + línea + columna, mensaje raw
    3. clasificar (ver tabla abajo)
    4. aplicar fix conforme a la clasificación
    5. re-ejecutar el comando completo
    6. intento++

si comando sigue fallando → escalacion v2 (ver abajo)
```

## Tabla de clasificación → fix

| Tipo de error | Detección (regex) | Fix automático |
|---|---|---|
| **TS: missing import** | `Cannot find name '(\w+)'` | Buscar export en `lib/`, `components/` → añadir import |
| **TS: unused var** | `'(\w+)' is declared but never used` | Prefijar con `_` o eliminar línea |
| **TS: type mismatch simple** | `Type '(.+)' is not assignable to type '(.+)'` | `null|undefined` → agregar `??`. string/number → cast |
| **ESLint: prefer-const** | `prefer-const` | Reemplazar `let` por `const` |
| **ESLint: no-unused-vars** | `no-unused-vars` | Prefijar `_` |
| **Vitest: snapshot mismatch** | `Snapshot.*does not match` | Solo `npm test -- -u` si Brandon dijo "regenera". Si no → reportar |
| **Vitest: assertion fail** | `expected.*to (equal|be|deepEqual)` | NO auto-fix — reportar (probablemente bug real) |
| **Build: módulo no existe** | `Module not found:` | Verificar typo, sugerir package o ruta correcta |
| **Build: env var missing** | `process.env.([A-Z_]+) is undefined` | Verificar `.env.local`, sugerir `vercel env pull` |

## Archivos NO tocar (zona segura)

Bajo ningún concepto auto-modificar — escalar inmediatamente sin intentar fix:

- `prisma/schema.prisma` (necesita migración manual)
- `proxy.ts` y `lib/middleware/**` (ADR 014)
- `components/CheckoutModal.tsx` (zona crítica ADR 015)
- `lib/auth/role-permissions.ts` (RBAC matriz)
- `package.json` `dependencies` (instalación humana)
- `.env*` (secrets)

## Salida por intento

Cada intento reporta: comando, estado (OK/fallando), error capturado (max 10 lineas), clasificacion (tipo + archivo:linea:col + estrategia), fix aplicado (diff), re-ejecucion (exit code + tiempo).

## Escalacion v2 — si 3 intentos fallan

```
intento 1-3: fix automatico basico (tabla arriba)
    ↓ si falla
intento 4: escalar a agente especialista:
    - TS complejo → ecc:build-error-resolver
    - Test/logica → reviewer
    - Lint complejo → reviewer
    - Build/webpack → optimizer
    El agente recibe: error completo, archivos involucrados, fixes intentados (diffs)
    ↓ si tampoco resuelve
intento 5: ESCALAR A BRANDON con: todos los intentos, diff acumulado, diagnostico del agente, sugerencia de accion manual, opcion de revertir
```

## Reglas duras

1. **Nunca commitear automáticamente.** Solo aplicar fixes en el árbol de trabajo.
2. **Nunca tocar archivos de zona peligrosa.** Escalar inmediatamente.
3. **Nunca pasar de 3 intentos básicos.** Mejor escalar que loop infinito.
4. **Siempre dejar diff visible** al usuario al cerrar el skill.
5. **Si el error parece bug real (assertion, lógica)**, no inventar fix → escalar.
6. **Cada intento debe re-ejecutar el comando completo** antes de declarar éxito.

## Referencia

- CLAUDE.md regla 13: Regla de Oro de Autonomía
- Memorias: `feedback_obsessive_boss_level4.md`, `feedback_max_ambition_default.md`
