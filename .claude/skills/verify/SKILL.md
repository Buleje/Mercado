---
name: verify
description: Gate obligatorio antes de reportar "listo". Corre tsc + lint + tests del área + curl de endpoints tocados. Si alguno falla, bloquea el reporte con una tabla de qué arreglar. Usar al cerrar una tarea, antes de decir "consolidado", "integrado", "terminado". Complementa a /deploy check (que es pre-deploy full).
user-invocable: true
model: haiku
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[quick|full|api-route|component]"
---

# /verify — Gate de "antes de decir listo"

**Qué hace (Feynman):** Maneja el auto una cuadra antes de entregarlo al cliente. Corre los chequeos mínimos para que lo que dije "listo" sea realmente "listo".

## Cuándo dispararse

- **Siempre** antes de reportar que cerré una tarea ("consolidado", "terminado", "aplicado")
- Antes de commitear código que toca la zona peligrosa (checkout, orders, RBAC)
- Cuando Brandon diga "verify", "comprobá", "ya anda?"

## Modos

### `/verify quick` (~15s) — DEFAULT si tocó 1-2 archivos

| Check | Qué valida | Exit criterion |
|---|---|---|
| `npx tsc --noEmit` | Tipos en todo el proyecto | 0 errores |
| `git diff --name-only` | Muestra qué archivos cambiaron | Info |

### `/verify full` (~2 min) — SI tocó 5+ archivos o zona peligrosa

| Check | Qué valida | Exit criterion |
|---|---|---|
| `npm run lint` | ESLint completo | 0 errores |
| `npx tsc --noEmit` | Tipos completos | 0 errores |
| `npx vitest run <files>` | Tests relacionados al cambio | 100% pasan |
| `curl` endpoints afectados | Runtime sin 500 | HTTP < 500 |

### `/verify api-route` — SI toqué un `app/api/**/route.ts`

Como `full` + además:
- `curl -s -o /dev/null -w "%{http_code}"` sobre el endpoint
- Verifica que no devuelve 500

### `/verify component` — SI toqué un `components/**/*.tsx`

Como `quick` + además:
- Arranca dev server si no está vivo (`curl http://localhost:3000 || npm run dev &`)
- MCP Playwright screenshot de la ruta donde aparece el componente

### `/verify build` — SI toqué páginas server, layouts, sitemap, lib usada en prerender

**`tsc --noEmit` NO atrapa errores de prerender** (ej. `Date.now()` en server bajo
Cache Components, cache `.next/dev` corrupto) — lección 2026-07-02: dos "listo"
bloqueados por el Stop hook por saltarse esto. Un solo comando hace TODA la danza
(mata dev → limpia .next → build → veredicto → re-levanta dev):

```bash
node scripts/build-gate.mjs            # gate completo, exit 0 = apto para "listo"
node scripts/build-gate.mjs --no-restart   # sin re-levantar dev
```

Pegar el bloque "VEREDICTO BUILD-GATE" como evidencia. Log: `/tmp/build-gate.log`.
Cuándo es OBLIGATORIO: cambios en `app/**/page.tsx` server, `app/**/layout.tsx`,
`app/sitemap.ts`, o libs llamadas desde páginas prerenderizadas. Cambios client-only
(`"use client"`) no lo requieren (tsc + curl + screenshot bastan).

## Algoritmo

```
1. Detectar archivos cambiados: git diff --name-only HEAD~1 HEAD + git status --porcelain
2. Clasificar: api-route, component, db-layer, test, config
3. Elegir modo según clasificación (o argumento explícito)
4. Correr checks en paralelo con run_in_background donde posible
5. Esperar resultados
6. Tabla Feynman del resultado
7. Si fail → listar qué arreglar, NO reportar "listo"
   Si pass → verde, reportar con la tabla como evidencia
```

## Reporte esperado

```markdown
## ✅ /verify — listo

| Check | Resultado | Tiempo |
|---|---|---|
| tsc --noEmit | ✅ 0 errores | 8s |
| npm run lint | ✅ 0 warnings | 6s |
| vitest (3 files) | ✅ 21/21 | 3s |
| curl /api/foo | ✅ HTTP 200 | 0.1s |

Total: 17s. Seguro decir listo.
```

O si falla:

```markdown
## ❌ /verify — NO listo

| Check | Resultado | Qué arreglar |
|---|---|---|
| tsc --noEmit | ❌ 2 errores | `lib/foo.ts:23` — falta `Promise<...>` |
| vitest | ⚠️ 1 fail | `bar.test.ts:45` — expected X, got Y |

NO reportar "listo" hasta que queden 0 fails.
```

## Regla de oro

**NUNCA decir "listo" / "consolidado" / "integrado" sin haber corrido `/verify`.**

Si un check falla, leer el error, arreglar, y re-correr `/verify`. Si después de 3 intentos sigue fallando, escalar al agente `healer`.

## Complemento

- `/deploy check` — más exhaustivo, para PRE-DEPLOY real (build-gate + SLO gates, sin push)
- `/verify` — intra-sesión, barato, constante, antes de cada "listo"
- agente `healer` — cuando `/verify` falla repetido y hay que depurar

## Ejemplo de invocación

Tras editar `lib/db/marketplace.db.ts` y `app/marketplace/[slug]/page.tsx`:

```
/verify full
```

Esperar output. Si todo verde, recién ahí reportar al usuario con la tabla como prueba.
