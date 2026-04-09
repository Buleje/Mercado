# ADR-019: Next 16 Cache Components incompatible con `export const dynamic = "force-dynamic"`

## Estado
✅ Aceptada — hotfix aplicado 2026-04-09 (488 archivos `.ts/.tsx` limpiados)

## Fecha
2026-04-09

## Contexto

Next.js 16.1.6 con `cacheComponents: true` habilitado en `next.config.ts` (activado 2026-04-08 como parte del Plan Maestro Sprint 1 quick win Q5) **rechaza** el export `export const dynamic = "force-dynamic"` en route handlers y layouts.

Error visible en dev server + browser console:

```
./app/(store)/layout.tsx (22:14)
Ecmascript file had an error
export const dynamic = "force-dynamic";
Route segment config "dynamic" is not compatible with
`nextConfig.cacheComponents`. Please remove it.
```

El error aparecía en 516 ocurrencias a lo largo de 488 archivos del repo. El build y el dev server quedaron rotos tras la actualización a Next 16.

## Causa raíz

La regla crítica #4 del CLAUDE.md (versión histórica) obligaba a poner `export const dynamic = "force-dynamic"` en todos los route handlers que leen cookies/session. Esa regla era correcta hasta Next 15 pero quedó desfasada cuando Next 16 introdujo **Cache Components** (reemplaza al viejo `experimental.ppr`) con una arquitectura de caché explícita basada en la directiva `'use cache'` + `cacheLife` + `cacheTag` + `updateTag` / `revalidateTag`.

Con Cache Components, Next.js **auto-detecta** que una ruta es dinámica por el uso de APIs runtime (`cookies()`, `headers()`, `searchParams`). No hace falta el export explícito. Tenerlo produce un conflicto con la infraestructura de caché.

## Opciones consideradas

### Opción A: Desactivar `cacheComponents` en `next.config.ts`
- ✅ Preserva la regla crítica #4 como estaba
- ✅ Revert local de 1 línea
- ❌ Pierde el Quick Win Q5 del Plan Maestro Sprint 1 (−60-80% invocaciones Vercel en rutas públicas + LCP −200-500ms)
- ❌ Regresa la arquitectura de caché a un modelo viejo (experimental.ppr)
- ❌ Bloquea la ruta de migración a `'use cache'` directive

### Opción B: Remover `export const dynamic = "force-dynamic"` de los 488 archivos
- ✅ Alineado con la guía oficial Next 16 (`next-cache-components` docs)
- ✅ Preserva Cache Components + sus beneficios de performance
- ✅ El runtime sigue sirviendo las rutas dinámicas correctamente (auto-detect)
- ❌ Requiere edición masiva en 488 archivos
- ❌ Actualización de CLAUDE.md + agents + PR template + skills

### Opción C: Conversión gradual a `'use cache: private'`
- ✅ Patrón más moderno
- ❌ Scope creep — requiere refactorizar cada handler individualmente
- ❌ Bloquea el deploy por semanas

## Decisión

Elegimos la **Opción B — remover el export en los 488 archivos**.

**Implementación:**

1. Script `scripts/remove-force-dynamic.ts` que:
   - Escanea `.ts/.tsx` recursivamente
   - Excluye `node_modules`, `.next`, `.git`, `lib/generated`, `.husky`, `.claude/worktrees`
   - Remueve la línea `export const dynamic = "force-dynamic"` + el comentario previo explicativo si lo tenía
   - Remueve la línea en blanco residual
2. Verificación con `grep` → 0 ocurrencias en código fuente
3. `npx tsc --noEmit` → 0 errores
4. Actualización de CLAUDE.md regla crítica #4 para reflejar el nuevo estándar

## Consecuencias

### Positivas
- Build y dev server vuelven a funcionar
- Cache Components queda operativo (Plan Maestro Sprint 1 Q5 preservado)
- Cada route handler ya no necesita el boilerplate del export
- Futuras rutas públicas cacheables pueden adoptar `'use cache'` directamente

### Negativas
- Cualquier PR viejo que añada `export const dynamic = "force-dynamic"` tendrá que ser re-escrito
- La regla crítica #4 del CLAUDE.md cambió de obligación a prohibición

### Riesgos
- **Ninguna ruta debería dejar de ser dinámica** — Next 16 auto-detecta al leer cookies/headers/searchParams. Riesgo mitigado por el hecho de que el código ya llama `getSessionPayload()`, `cookies()`, `headers()`, etc. en los handlers.
- **CLAUDE.md y docs obsoletos** — ver sección "Referencias" para la lista completa actualizada en este mismo commit.

## Referencias
- `next.config.ts` — `cacheComponents: true` (activado 2026-04-08)
- `~/.claude/plugins/cache/claude-plugins-official/vercel/.../skills/next-cache-components/SKILL.md` — guía oficial con la tabla de migración
- `CLAUDE.md` — regla crítica #4 actualizada
- `scripts/remove-force-dynamic.ts` — script del hotfix
- ADR-016 — Plan Maestro 24 semanas (contiene el Quick Win Q5 que introdujo `cacheComponents: true`)
