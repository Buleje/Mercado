# Estrategia de Versionado de APIs

**Fecha:** 2026-04-06
**Estado:** Propuesta — fase 1 scaffold listo, migración gradual en curso
**ADR relacionado:** Ninguno aún (se creará cuando se migre el primer endpoint crítico)

---

## Objetivo

Permitir evolucionar los endpoints de la API sin romper clientes existentes (app móvil Capacitor, webhooks de SUNAT, integraciones de proveedores, widgets embed).

## Estado actual

- **435 route handlers** en `app/api/` sin versionado.
- Cliente principal: la propia app Next.js (frontend + storefront) — puede desplegarse junto con el backend.
- Clientes externos: app móvil (Capacitor), webhooks de Stripe/MercadoPago/SUNAT/WhatsApp, cron jobs con `CRON_SECRET`.
- Cualquier breaking change obliga a desplegar app móvil + todos los clientes al mismo tiempo. Frágil.

## Principios

1. **Compatibilidad backward es el default.** Romper un contrato requiere pasar por `/v2/`.
2. **Migración gradual, no big-bang.** Mover endpoint por endpoint, solo cuando haya razón.
3. **Un punto de verdad por endpoint.** El endpoint legacy re-exporta desde `/v1/`, nunca se duplica la lógica.
4. **OpenAPI es la fuente de verdad del contrato.** Generado desde Zod con `npm run openapi:generate`.
5. **Deprecación explícita.** Headers `Deprecation: true` + `Sunset: <date>` + `Link: <successor>` en endpoints legacy.

## Fases de migración

### Fase 1 — Scaffold (✅ HECHO)
- [x] Crear `app/api/v1/` con README
- [x] Crear este documento
- [x] Actualizar PR template para recordar versionado

### Fase 2 — Helpers + middleware (pendiente)
- [ ] Crear `lib/api-version.ts` con helpers:
  - `deprecatedResponse(res, successor)` — agrega los 3 headers de deprecación
  - `stripApiVersion(pathname)` → devuelve `/api/foo` desde `/api/v1/foo` (para reuso de prefix lists en `proxy.ts`)
- [ ] Actualizar `proxy.ts` para que las listas `ADMIN_ONLY_API_PREFIXES` y compañeras apliquen tanto a `/api/foo` como a `/api/v1/foo` usando `stripApiVersion`.
- [ ] Actualizar `lib/tenant-fetch.ts` con parámetro opcional `version = "v1" | "legacy"` (default `legacy` hasta que la migración esté avanzada).

### Fase 3 — Migrar endpoints críticos primero (pendiente)
Orden sugerido (por criticidad + estabilidad del contrato):

| Orden | Endpoint | Razón | Clientes afectados |
|---|---|---|---|
| 1 | `/api/orders` (POST, GET) | Core del negocio, llamado por storefront + app móvil | Storefront, app móvil, webhooks de pago |
| 2 | `/api/products` (GET) | Catálogo público, alto QPS | Storefront, app móvil, marketplace |
| 3 | `/api/checkout/...` | Procesa pagos | Storefront |
| 4 | `/api/customers/search` | Usado por CheckoutModal y admin | Admin, Storefront |
| 5 | `/api/coupons/validate` | Validación pre-compra | Storefront |
| 6 | `/api/auth/*` | Sesión JWT | Todo |
| 7 | Restantes por módulo | Inventario, finanzas, CRM, etc. | Admin principalmente |

### Fase 4 — Deprecar endpoints sin versión (pendiente)
Cuando más del 80% del tráfico pase por `/v1/`:
- [ ] Agregar banner de deprecación en logs por cada request al path legacy
- [ ] Notificar a integraciones externas 6 meses antes
- [ ] Después de 6 meses, `proxy.ts` devuelve `410 Gone` a los paths legacy (con excepciones para webhooks ya firmados)

## Cómo migrar UN endpoint (receta)

Ejemplo: migrar `app/api/products/route.ts` a `app/api/v1/products/route.ts`.

### Paso 1 — Crear el nuevo archivo
```ts
// app/api/v1/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ProductsDB } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ListQuery = z.object({
  category: z.string().optional(),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const result = await ProductsDB.list(auth.tenantId, parsed.data);
  return NextResponse.json({ data: result.items }, {
    headers: {
      "X-Total-Count": String(result.total),
      "X-Cursor": result.nextCursor ?? "",
    },
  });
}
```

### Paso 2 — Reemplazar el legacy por un re-export
```ts
// app/api/products/route.ts
import { deprecatedResponse } from "@/lib/api-version";
import { GET as V1_GET } from "@/app/api/v1/products/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const res = await V1_GET(req as never);
  return deprecatedResponse(res, "/api/v1/products");
}
```

### Paso 3 — Actualizar las prefix lists en `proxy.ts`
Si `/api/products` estaba en `SHARED_WRITE_ADMIN_API_PREFIXES`, agregar también `/api/v1/products`. O mejor: usar `stripApiVersion` en el matcher.

### Paso 4 — Regenerar OpenAPI
```bash
npm run openapi:generate
```

Verificar que el spec tenga ambas rutas, la legacy marcada `deprecated: true`.

### Paso 5 — Test + commit
```bash
npx tsc --noEmit && npm run lint && npm run test -- products
git commit -m "feat(api): version /api/products as /api/v1/products"
```

## Impacto en el middleware (`proxy.ts`)

**Problema actual:** Las listas de prefijos (`ADMIN_ONLY_API_PREFIXES`, `SHARED_WRITE_ADMIN_API_PREFIXES`, etc.) contienen paths como `/api/admin`, `/api/sales`, `/api/inventory-movements`. Un request a `/api/v1/admin` NO matchearía porque empieza con `/api/v1/`.

**Solución (fase 2):** Agregar un helper `stripApiVersion` y aplicarlo antes del matching:
```ts
// lib/api-version.ts
const API_VERSION_REGEX = /^\/api\/v\d+(\/|$)/;

export function stripApiVersion(pathname: string): string {
  return pathname.replace(API_VERSION_REGEX, "/api/");
}
```

En `proxy.ts`:
```ts
const normalizedPath = stripApiVersion(url.pathname);
if (ADMIN_ONLY_API_PREFIXES.some((p) => normalizedPath.startsWith(p))) {
  // ... mismo chequeo de auth para legacy y /v1/
}
```

Esto mantiene el matching funcionando con cero duplicación de listas.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Duplicación de lógica entre legacy y /v1/ | Regla estricta: legacy siempre re-exporta desde /v1/, nunca duplica |
| Inconsistencia entre OpenAPI y runtime | `npm run openapi:generate` en pre-commit (agregarlo a lint-staged) |
| Rate limiting duplicado (legacy + v1) contando el mismo cliente 2x | El rate limiter ya es por IP, no por path — no afecta |
| Tests rotos durante migración | Migrar solo con tests existentes pasando; correr suite completa por cada migración |
| Subagente / feature flag confusion | Usar feature flag `api-v1-enabled` en `lib/feature-flags.ts` si hace falta rollout gradual |

## Métricas de éxito

- [ ] 100% de endpoints nuevos creados desde hoy (2026-04-06) viven en `/api/v1/`
- [ ] Al menos 20% de endpoints críticos migrados antes de 2026-07-01
- [ ] 80% del tráfico en `/api/v1/` antes de 2026-12-31
- [ ] Deprecación formal de `/api/` (sin versión) en 2027-Q1
