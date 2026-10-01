# ADR-428 — El gate de tipos corre con el compilador nativo (TypeScript 7), el paquete sigue en 5.9

- **Fecha:** 2026-09-22
- **Estado:** Aceptado
- **Ámbito:** build, CI, pre-commit, harness de agentes

## Contexto

El gate `tsc --noEmit` es el cuello de botella de cada commit y de cada corrida de agente.
Medido hoy sobre este repo (3.236 `.ts` + 2.661 `.tsx`, 254 modelos Prisma):

| Compilador | Estado de caché | Tiempo | RAM pico | Errores |
|---|---|---|---|---|
| `tsc` 5.9.3 (JS) | caliente (`tsconfig.tsbuildinfo` del día) | **195,5 s** | 6,7 GB | 0 |
| `tsc` 7.0.2 (Go, nativo) | frío | 49,6 s | 6,9 GB | 0 |
| `tsc` 7.0.2 (Go, nativo) | 2.ª corrida | 22,5 s | 7,0 GB | 0 |
| `tsc` 7.0.2 (Go, nativo) | page cache del SO caliente | **4,8 s** | — | 0 |
| `tsc` 7.0.2 con `-p tsconfig.build.json` | — | 42,2 s | — | 0 |

El nativo no guarda `tsbuildinfo`: su variación (4,8 → 49,6 s) es page cache del sistema de
archivos, no incremental. Aun en el peor caso (frío, 49,6 s) es **4× más rápido** que el mejor
caso del anterior (195,5 s con su caché incremental caliente). En una sesión de trabajo, donde
los archivos ya están en RAM, el gate cuesta **~5 s**. Tres mediciones independientes lo
confirmaron en esta sesión (4,2 · 4,6 · 7,4 s, dos de ellas desde subagentes).

Mismo veredicto, entre 8,7× y 40× menos espera según cuán caliente esté el page cache. El comentario del hook
decía "warm ~10 s" — la medición lo desmiente por un orden de magnitud.

El binario nativo ya estaba instalado (`@typescript/typescript-linux-x64@7.0.2`) pero **suelto**:
no figuraba en `package.json`, así que `npm ci` en CI no lo habría traído, y sólo lo usaba
`typecheck:fast`, un script que nada invocaba automáticamente.

## Decisión

1. El gate de tipos pasa a `node scripts/tsc7.mjs`, que resuelve el binario nativo de la
   plataforma (`@typescript/typescript-<plataforma>-<arch>/lib/tsc`) y **cae a `tsc` 5.9 con heap
   ampliado** si no existe uno. Cablado en: `npm run typecheck`, `npm run build`,
   `.husky/pre-commit`, `.github/workflows/ci.yml` y `.claude/hooks/pre-deploy-enterprise-gate.mjs`.
2. `@typescript/typescript-linux-x64` se declara en `devDependencies`.
3. **El paquete `typescript` NO sube a 7.x.** `npm view typescript dist-tags` ya da `latest: 7.0.2`,
   pero TS 7.0 no expone una API programática estable (llega en 7.1) y la usan
   `typescript-eslint`, Storybook (`react-docgen-typescript`) y el typecheck interno de Next.
   Subir el paquete pisa `node_modules/.bin/tsc` y rompe esas herramientas.
4. Queda `npm run typecheck:legacy` para contrastar un veredicto dudoso con el compilador viejo.

## Consecuencias

- Pre-commit y CI dejan de esperar ~3 min por el gate de tipos.
- `NODE_OPTIONS=--max-old-space-size=8192` deja de ser necesario para el typecheck (sigue haciendo
  falta para lint-staged con ESLint sobre commits grandes, así que **no se quitó** del hook).
- El pico de RAM sigue en ~7 GB: bajo el tope de 13 GB del cgroup, pero **un typecheck por vez**
  (el `mem-guard` lo corta en 3 procesos apilados). El contexto que reciben los subagentes ya lo dice.
- Riesgo asumido: dos compiladores en el repo pueden divergir en un caso borde. Mitigación:
  `typecheck:legacy` + hoy ambos dan 0 errores sobre el mismo árbol.

## Alternativas descartadas

- **Subir `typescript` a 7.0.2**: rompe la API programática de la que dependen ESLint y Storybook.
- **Dejar el gate en 5.9 y usar el nativo sólo como pre-check**: era el estado previo, y el
  resultado medido fue que nadie lo corría — el gate lento seguía siendo el que decidía.
- **`tsc --build` con proyectos referenciados**: reduciría el trabajo incremental, pero exige
  partir el repo en proyectos; el nativo da 8,7× sin tocar la estructura.

## Referencias

- `scripts/tsc7.mjs` — resolver y fallback, con los números medidos en el encabezado.
- TypeScript 7.0 GA (jul-2026): https://www.infoq.com/news/2026/08/typescript-7-released/
- Nota relacionada: el React Compiler quedó descartado en esta ronda por evidencia propia
  (no transforma con `--turbopack` en Next 16.2.10) — ver `.claude/improvement-radar.md`.
