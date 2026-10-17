---
paths:
  - "lib/db/**"
  - "app/api/**"
---

# Reglas al tocar lib/db/** o app/api/**

- `tenantId` SIEMPRE 1er parámetro; sin fallback `"main"`. En la ruta sale de `auth.tenantId` (JWT), nunca del header (puede traer slug, el JWT trae el CUID).
- Endpoints públicos sin auth: `getTenantIdFromRequest()`. Update/delete con doble filtro `where: { tenantId, id }`.
- Nunca `prisma.*` directo fuera de `lib/db/*.db.ts` (cache + audit + invalidate).
- Zod `safeParse()`, nunca `.parse()`.
- Raw SQL solo con placeholders `$1 $2`; jamás interpolación.
- Invalidar caché tras writes: `invalidate(key)` / `invalidateByPrefix(prefix)`.
- NO `export const dynamic = "force-dynamic"` (rompe cacheComponents, ADR-019). Usar `"use cache"` + `cacheLife()`/`cacheTag()`.
- `requireAdmin(req, roles[])` en routes protegidas; totales se calculan en backend.
- Prisma `upsert` con `id: 0` inserta id=0 literal → usar `create()` para altas.
- `applyRateLimit` es SÍNCRONO (no es bug llamarlo sin await).
- Campo nuevo en schema → la migración NO corre con `prisma migrate` (pooler): SQL idempotente + script pg con DIRECT_URL + `prisma generate` + REINICIAR dev server.
- Checklist completo y gaps conocidos (DB classes con default `"main"`, OrderItem/SaleItem fuera de TENANT_MODELS): skill `multi-tenant-guard`. Rubrics en `.claude/rubrics/` (ya no los corre un hook, 02-10).
