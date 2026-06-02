---
name: endpoint-scaffold
description: |
  Genera un API route en `app/api/**/route.ts` conforme al rubric
  `.claude/rubrics/api-endpoint.json` y al patrón multi-tenant de Buleje.
  Garantiza las 7 reglas obligatorias (tenantId, safeParse, DB class, requireAdmin,
  rate limit, sin force-dynamic, error handling). Usar cuando Brandon diga
  "nuevo endpoint", "crea API route", "agrega endpoint /api/...".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
argument-hint: "[método + ruta, ej: POST /api/products]"
---

# /endpoint-scaffold — API route conforme al rubric

Antes de escribir: cargar skill `multi-tenant-guard` y leer `.claude/rubrics/api-endpoint.json`.

## Checklist obligatorio (rubric api-endpoint.json — critical)
1. **Auth/RBAC**: `requireAdmin(req, [roles])` en rutas protegidas (CLAUDE.md regla 9).
2. **tenantId**: derivado de la sesión/tenant guard — **1er argumento** de toda query.
3. **Validación**: Zod `schema.safeParse(body)` — NUNCA `.parse()`. Devolver 400 con issues.
4. **DB**: SOLO vía `lib/db/*.db.ts` — jamás `prisma.*` directo.
5. **Rate limit**: `applyRateLimit` donde aplique (es síncrono — no `await`).
6. **Caché Next 16**: nada de `export const dynamic = "force-dynamic"`. Usar
   `"use cache"` + `cacheLife()`/`cacheTag()` en lecturas; invalidar tras writes.
7. **Errores**: try/catch con logger; nunca filtrar stack al cliente.

## Flujo
1. Detectar el modelo/dominio y buscar 1-2 endpoints similares como referencia
   (`Grep "export async function POST" app/api`).
2. Reusar/crear la DB class correspondiente (ver skill `db-class-scaffold`).
3. Escribir el route con el esqueleto conforme.
4. Verificar: `npx tsc --noEmit` sobre el archivo + correr el hook rubric-check.

## Esqueleto base
```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { XxxDB } from "@/lib/db/xxx.db";
import { z } from "zod";

const bodySchema = z.object({ /* ... */ });

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth;

  const rl = applyRateLimit(req, "xxx-write");
  if (!rl.ok) return rl.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await XxxDB.create(tenantId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // logger.error(...) — no filtrar stack
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
```
Ajustar nombres reales verificando `require-admin`, `rate-limit` y la DB class en el repo.
