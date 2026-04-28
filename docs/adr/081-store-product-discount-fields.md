# ADR-081: StoreProduct.discountPrice + discountUntil para ofertas reales

**Estado:** Aceptado · Expand aplicado 2026-04-28
**Fecha:** 2026-04-28
**Autor:** Buleje team
**Relacionado:** ADR-059 (marketplace retention), ADR-019 (cache strategy)
**Migration:** `add_storeproduct_discount_fields` (Supabase MCP `apply_migration`)

---

## Contexto

Hoy `/marketplace/ofertas` calcula descuentos comparando `Product.price` (precio base del catálogo central) contra `StoreProduct.retailPrice` (precio efectivo de la tienda). Esto fuerza al bodeguero a registrar dos precios distintos para que aparezca como "oferta", lo cual no es intuitivo y rompe el modelo conceptual: el bodeguero piensa en "precio normal" y "precio en oferta", no en "base catálogo" vs "venta retail".

Resultado actual: en producción casi ninguna tienda tiene ofertas detectables (`retailPrice < Product.price`), porque los bodegueros suben productos con `retailPrice = Product.price`. La página de ofertas queda vacía.

## Decisión

Agregar a `StoreProduct` tres campos opcionales:

```prisma
model StoreProduct {
  // … existentes …
  /// Precio promocional efectivo. Si null, no hay oferta vigente.
  discountPrice Decimal?  @db.Decimal(12, 2)
  /// Fecha hasta la cual la oferta es válida. Si null, sin caducidad.
  discountUntil DateTime?
  /// Texto opcional ("2x1", "Liquidación", "-30%") — para chips en UI.
  discountLabel String?   @db.VarChar(40)

  @@index([discountUntil])  // para barrer ofertas vencidas
}
```

## Reglas

| Regla | Detalle |
|---|---|
| `discountPrice` | Debe ser `< retailPrice`. Validar en endpoint admin. |
| `discountUntil` | Si `< now()`, la oferta se ignora en `/api/marketplace/deals`. |
| `discountLabel` | Free text, max 40 chars. Render en `UnifiedProductCard`. |
| `retailPrice` | Sigue siendo el "precio normal". Nunca se modifica al activar oferta. |

## Plan expand → migrate → contract

### Expand (esta migración — segura, rollback trivial)

```bash
npx prisma migrate dev --name add_storeproduct_discount_fields
```

Migration content:
```sql
ALTER TABLE "StoreProduct" ADD COLUMN "discountPrice" DECIMAL(12,2);
ALTER TABLE "StoreProduct" ADD COLUMN "discountUntil" TIMESTAMP(3);
ALTER TABLE "StoreProduct" ADD COLUMN "discountLabel" VARCHAR(40);
CREATE INDEX "StoreProduct_discountUntil_idx" ON "StoreProduct"("discountUntil");
```

Las 3 columnas son nullable → NO rompe clientes viejos. Deploy seguro sin ventana de mantenimiento.

### Migrate (post-expand)

1. Actualizar `lib/db/marketplace.db.ts`:
   - `MarketplaceStoreProductsDB.list` → SELECT incluye los 3 campos.
   - Nuevo método `setDiscount({ storeProductId, discountPrice, discountUntil, discountLabel })`.
   - Nuevo método `clearDiscount(storeProductId)`.
2. Actualizar `app/api/marketplace/deals/route.ts`:
   - Nuevo cálculo:
     ```ts
     const sale = sp.discountPrice && sp.discountUntil
       ? (new Date(sp.discountUntil) > new Date() ? Number(sp.discountPrice) : null)
       : sp.discountPrice ? Number(sp.discountPrice) : null;
     const base = Number(sp.retailPrice);
     ```
   - Si `sale` es null o `>= base` → no es deal.
3. Actualizar `UnifiedProductCard` para mostrar `discountLabel` cuando esté presente.
4. Endpoint admin `POST /api/admin/store-products/{id}/discount` (tenant-scoped).
5. UI admin: editor de oferta por producto (precio + fecha + label).

### Contract (no aplica)

No se elimina nada. La lógica vieja (basePrice vs retailPrice) sigue funcionando como fallback.

## Compatibilidad

- ✅ App actual (sin rebuild) sigue funcionando: ignora los 3 campos nuevos.
- ✅ Endpoint `/deals` sigue devolviendo lo que ya devolvía hasta que se actualice.
- ✅ Rollback: `DROP COLUMN discountPrice, discountUntil, discountLabel; DROP INDEX StoreProduct_discountUntil_idx;` — sin data loss real porque solo es metadata de promo.

## Pre-requisitos para deploy

1. `DIRECT_URL` accesible desde la máquina que corre `prisma migrate deploy`.
2. Backup de DB antes de la migración (cron `backup-offsite.yml` ya cubre).
3. Smoke test en staging primero.
4. `npx prisma generate` post-migration en CI.

## Tests requeridos

- `e2e/deals-real-discount.spec.ts`: setear oferta vía endpoint admin → verificar aparece en `/marketplace/ofertas`.
- Test de caducidad: `discountUntil` en el pasado → no aparece.
- Test de unset: `clearDiscount` → producto vuelve a precio normal.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Bodeguero pone `discountPrice > retailPrice` | Validación Zod en endpoint admin (`discountPrice < retailPrice`). |
| Olvidan `discountUntil` y la oferta queda eterna | Default 30 días si no se especifica; UI sugiere fecha. |
| Cache stale (oferta ya vencida pero aparece) | `cacheLife({ revalidate: 60 })` en `/deals`. Con la oferta caducada en query, sale del set en <60s. |

## Estado de implementación

- [x] ADR redactado (este archivo).
- [x] Schema editado (`prisma/schema.prisma:2547` + 3 campos + índice).
- [x] Migration aplicada vía Supabase MCP `apply_migration` (2026-04-28).
- [x] Prisma client regenerado.
- [ ] Endpoint admin de discount (`POST /api/admin/store-products/{id}/discount`).
- [ ] UI admin de discount (editor por producto).
- [ ] Endpoint `/deals` actualizado para preferir `discountPrice` sobre fallback heurístico.
- [ ] Tests e2e.

## Referencias

- ADR-019: cache strategy (cacheLife/cacheTag).
- ADR-059: marketplace retention.
- `app/api/marketplace/deals/route.ts`: endpoint actual (sin estos campos).
- `prisma/schema.prisma:2547`: `model StoreProduct` actual.
