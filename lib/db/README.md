# `lib/db/` — Capa de acceso a datos

Repository Pattern sobre Prisma. **Nunca importar Prisma directo desde route handlers** — usar siempre las clases de este directorio.

## Por qué existe

- Aísla Prisma del resto del código (cambio de ORM sin tocar handlers).
- Inyecta `tenantId` en toda query → multi-tenancy garantizado.
- Centraliza cache `getOrSet` + `invalidateByPrefix` (ver `lib/cache.ts`).
- Punto único para audit trail y logging estructurado.

## Convenciones

| Regla | Ejemplo |
|---|---|
| `tenantId` siempre como **primer parámetro** | `ProductsDB.getById(tenantId, id)` |
| Tipos exportados como `Db<Entity>`, `Db<Entity>CreateInput`, `Db<Entity>UpdateInput`, `Db<Entity>Filters` | `DbBatch`, `DbBatchCreateInput` |
| Fechas como **ISO strings**, no `Date` | usar helpers `toISO()`, `toDateOnly()` |
| Invalida cache después de write | `await invalidateByPrefix(\`products:\${tenantId}\`)` |
| Read replica para analytics pesadas | importar `prismaReadonly` desde `lib/prisma-readonly.ts` |

## Archivos (25 módulos)

Cada archivo expone un objeto `<Name>DB` con métodos `getAll`, `getById`, `create`, `update`, `delete` y queries específicas del dominio.

| Archivo | Dominio |
|---|---|
| `products.db.ts` | Productos, variantes, precios |
| `orders.db.ts` | Pedidos — state machine + idempotencia (zona de peligro) |
| `inventory.db.ts` | Stock, movimientos, ajustes |
| `batches.db.ts` | Lotes con fecha de vencimiento |
| `customers.db.ts` | Clientes B2C/B2B |
| `sales.db.ts` | Ventas POS |
| `purchases.db.ts` | Compras a proveedores |
| `marketplace.db.ts` | Catálogo público multi-tenant |
| `treasury.db.ts` | Caja, turnos, arqueos |
| `finance.db.ts` | Ingresos, egresos, KPIs financieros |
| `credit.db.ts` · `fiados.db.ts` · `prestamos.db.ts` | Crédito, fiado, préstamos |
| `notifications.db.ts` | Notificaciones in-app y push |
| `promotions.db.ts` | Cupones, descuentos, bundles |
| `forecasting.db.ts` | Predicción de demanda |
| `cotizaciones.db.ts` · `guias-remision.db.ts` · `notas-credito.db.ts` | Documentos comerciales |
| `recetas.db.ts` | Recetas/composiciones |
| `mermas.db.ts` | Mermas y pérdidas |
| `supplier-portal.db.ts` | Portal del proveedor |
| `turnos.db.ts` | Turnos de cajero |
| `settings.db.ts` | Configuración por tenant |
| `misc.db.ts` | Misceláneos |
| `index.ts` | Barrel export — `import { ProductsDB, OrdersDB } from "@/lib/db"` |

## Patrón de uso

```typescript
import { OrdersDB } from "@/lib/db";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const order = await OrdersDB.create(auth.tenantId, parsed.data);
  await invalidateByPrefix(`orders:${auth.tenantId}`);
  return NextResponse.json({ data: order });
}
```

## Tests

Tests en `__tests__/` mockean `server-only` (ver `__mocks__/server-only.ts`) para poder importar estas clases desde jsdom.
