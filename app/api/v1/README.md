# `/api/v1/` — API Versionada

Esta carpeta contiene la versión 1 oficial de la API pública de Buleje.

## Política de versionado

- **`/api/...`** (sin versión) — legacy. Se mantiene activo por compatibilidad con clientes existentes (app móvil, webhooks, integraciones).
- **`/api/v1/...`** — API versionada. **Todos los endpoints nuevos deben crearse aquí**.
- **`/api/v2/...`** — se creará cuando haya un breaking change que no pueda hacerse en `/v1/`.

## Regla de oro

> Un endpoint en `/api/v1/` **nunca rompe su contrato** sin promover un `/api/v2/`.

Se puede:
- ✅ Agregar campos opcionales nuevos al response
- ✅ Aceptar campos opcionales nuevos en el request
- ✅ Agregar nuevos valores a un enum (si el cliente los ignora seguros)
- ✅ Agregar endpoints nuevos

NO se puede:
- ❌ Eliminar o renombrar campos
- ❌ Cambiar tipos (`string` → `number`)
- ❌ Cambiar el significado semántico de un campo
- ❌ Hacer obligatorio un campo que antes era opcional
- ❌ Cambiar códigos de status HTTP para el mismo caso

## Migración gradual

La estrategia es **mover endpoints a `/v1/` sólo cuando** hay una razón para tocarlos. No migración masiva. Ver `docs/api-versioning-strategy.md` para el plan completo.

Checklist para migrar un endpoint `/api/foo/route.ts` → `/api/v1/foo/route.ts`:

1. [ ] Copiar el handler a `app/api/v1/foo/route.ts`
2. [ ] En `app/api/foo/route.ts`, reemplazar el handler por un re-export del `/v1/`:
   ```ts
   export { GET, POST } from "@/app/api/v1/foo/route";
      ```
3. [ ] Agregar header `Deprecation: true` y `Link: </api/v1/foo>; rel="successor-version"` al response de la versión legacy.
4. [ ] Actualizar OpenAPI spec con ambas rutas (legacy marcada `deprecated: true`).
5. [ ] Actualizar `lib/tenant-fetch.ts` para que llamadas internas usen `/api/v1/...`.
6. [ ] Notificar a la app móvil + integraciones externas.

## Estructura esperada

```
app/api/v1/
├── README.md                  # Este archivo
├── orders/
│   ├── route.ts               # GET /api/v1/orders, POST /api/v1/orders
│   └── [id]/
│       └── route.ts           # GET/PUT/DELETE /api/v1/orders/:id
├── products/
│   └── route.ts
└── ...
```

## Auth, rate limiting y tenant resolution

Todo eso ya funciona en `/api/v1/...` porque `proxy.ts` hace tenant resolution + rate limiting sobre **todas** las rutas `/api/*` por defecto. Las prefijo-listas (`ADMIN_ONLY_API_PREFIXES`, etc.) deben actualizarse cuando se migre un endpoint — agregar el camino con `/v1/` al lado del legacy.

## OpenAPI

`npm run openapi:generate` debe incluir ambas versiones. El spec generado refleja los endpoints reales en código.
