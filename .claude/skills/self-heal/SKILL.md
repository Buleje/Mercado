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

Implementación ejecutable de la **Regla de Oro de Autonomía** (CLAUDE.md regla 13):

> "Si una tarea falla por error de sintaxis o tests, el sistema DEBE intentar repararse solo usando el skill /self-heal antes de pedir feedback."

## Cuándo dispararse

Automático tras cualquiera de estos comandos con exit code ≠ 0:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

Manual: `/self-heal [comando]` o `/self-heal last`.

## Algoritmo — máximo 3 intentos

```
intento ← 1
mientras intento ≤ 3 y comando devuelva error:
    1. capturar stdout + stderr completos
    2. extraer:
       - tipo de error (TS####, ESLint rule, Vitest assertion, build error)
       - archivo + línea + columna
       - mensaje raw
    3. clasificar (ver tabla abajo)
    4. aplicar fix conforme a la clasificación
    5. re-ejecutar el comando
    6. intento++

si comando sigue fallando:
    REPORTAR a Brandon con:
      - 3 intentos de fix aplicados
      - diff acumulado
      - razón por la que no convergió
      - sugerencia de acción manual
```

## Tabla de clasificación → fix

| Tipo de error | Detección (regex) | Fix automático |
|---|---|---|
| **TypeScript: missing import** | `Cannot find name '(\w+)'` | Buscar export en `lib/`, `components/` → añadir import |
| **TypeScript: unused var** | `'(\w+)' is declared but never used` | Prefijar con `_` o eliminar línea |
| **TypeScript: type mismatch simple** | `Type '(.+)' is not assignable to type '(.+)'` | Si es `null \| undefined`, agregar `??`. Si es string vs number, agregar `Number()` o `String()` |
| **ESLint: prefer-const** | `prefer-const` | Reemplazar `let` por `const` |
| **ESLint: no-unused-vars** | `no-unused-vars` | Igual que TS: prefijar `_` |
| **Vitest: snapshot mismatch** | `Snapshot.*does not match` | Si Brandon dijo "regenera snapshots" → `npm test -- -u`. Si no → reportar diff |
| **Vitest: assertion fail** | `expected.*to (equal|be|deepEqual)` | NO auto-fix — reportar (probablemente bug real) |
| **Build: módulo no existe** | `Module not found:` | Verificar typo, sugerir package o ruta correcta |
| **Build: env var missing** | `process.env.([A-Z_]+) is undefined` | Verificar `.env.local`, sugerir `vercel env pull` |

## Archivos NO tocar (zona segura)

Bajo ningún concepto auto-modificar:

- `prisma/schema.prisma` (necesita migración manual)
- `proxy.ts` y `lib/middleware/**` (ADR 014)
- `components/CheckoutModal.tsx` (zona crítica ADR 015)
- `lib/auth/role-permissions.ts` (RBAC matriz)
- `package.json` `dependencies` (instalación humana)
- `.env*` (secrets)

Si el error está en uno de estos → escalar inmediatamente sin intentar fix.

## Salida obligatoria del skill

Después de cada intento (éxito o fallo):

```markdown
## 🔧 Self-Heal — intento N/3

**Comando:** `npm run lint`
**Estado:** ❌ Falló → ⏳ Reparando → ✅ OK | ❌ Sigue fallando

### Error capturado
```
[primer error del stack trace, max 10 líneas]
```

### Clasificación
- Tipo: [TS2304 | ESLint prefer-const | etc.]
- Archivo: `path:line:col`
- Estrategia: [añadir import | prefijar _ | etc.]

### Fix aplicado
```diff
- línea original
+ línea reparada
```

### Re-ejecución
- Exit code: [0 | 1]
- Tiempo: [Xs]
```

## Si los 3 intentos fallan → escalacion en cascada (v2, 2026-04-10)

Antes de escalar a Brandon, intentar escalacion automatica a agentes especialistas:

```
intento 1-3: fix automatico basico (tabla de clasificacion arriba)
    ↓ si falla
intento 4: escalar a agente especialista segun tipo de error:
    - Error TypeScript complejo → Agent(subagent_type="ecc:build-error-resolver")
    - Error de test/logica → Agent(subagent_type="bug-hunter")
    - Error de lint complejo → Agent(subagent_type="refactoring-expert")
    - Error de build/webpack → Agent(subagent_type="performance-engineer")
    ↓ si el agente especialista tampoco resuelve
intento 5: ESCALAR A BRANDON con reporte completo
```

### Formato de escalacion a agente especialista (intento 4)

```
Agent({
  description: "Self-heal escalation: [tipo de error]",
  subagent_type: "[agente-especialista]",
  prompt: "El self-heal basico fallo 3 veces con este error:
    [error completo]
    
    Archivos involucrados: [lista]
    Fixes intentados: [lista de diffs]
    
    Tu trabajo: diagnosticar la causa raiz y aplicar el fix correcto.
    Despues de tu fix, ejecuta: [comando que fallo]
    Si pasa, reporta exito. Si no, reporta por que no se puede auto-reparar."
})
```

### Si todo falla → escalar a Brandon

```markdown
## 🚨 Self-Heal agotado — escalando a Brandon

**Comando:** `npm run test`
**Intentos:** 3 basicos + 1 agente especialista = 4/4 sin convergencia

### Diff acumulado
[diff de todos los cambios aplicados, sin commitear]

### Agente especialista consultado
- Agente: [nombre]
- Diagnostico: [resumen de 1 linea]
- Por que no convergio: [explicacion]

### Sugerencia
- Accion manual recomendada: [...]
- Revertir mis cambios? (si/no)
```

## Reglas duras del skill

1. **Nunca commitear automáticamente.** Solo aplicar fixes en el árbol de trabajo.
2. **Nunca tocar archivos de zona peligrosa.** Escalar inmediatamente.
3. **Nunca pasar de 3 intentos.** Mejor escalar que entrar en loop infinito.
4. **Siempre dejar diff visible** al usuario al cerrar el skill.
5. **Si el error parece bug real (assertion, lógica)**, no inventar fix → escalar.
6. **Cada intento debe re-ejecutar el comando completo** antes de declarar éxito.

## Ejemplo de uso

```
brandon> /self-heal build
claude> 🔧 Self-Heal arrancando...
        Comando: npm run build
        Intento 1/3: Cannot find name 'logActivity' en app/api/orders/route.ts:42
        → import { logActivity } from '@/lib/audit'
        Re-ejecutando... ✅ OK
        Build verde en 23s.
```

## Referencia

- Memoria: `feedback_obsessive_boss_level4.md` — autonomía total
- Memoria: `feedback_max_ambition_default.md` — no pedir confirmación si es reversible
- CLAUDE.md regla 13: Regla de Oro de Autonomía
