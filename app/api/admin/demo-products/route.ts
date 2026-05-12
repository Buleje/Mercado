import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// IDs of the 24 products auto-seeded from data/products.ts when the DB was empty
const DEMO_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

/**
 * POST /api/admin/demo-products
 * Seed productos demo de bodega peruana real.
 * Solo ejecuta si hay <10 productos (evita duplicados).
 */
const PRODUCTOS_BODEGA = [
  // Abarrotes
  { name: "Arroz Extra 5kg", price: 22.50, costPrice: 18.00, category: "Abarrotes", unit: "bolsa", stock: 50, stockMin: 10, stockMax: 80 },
  { name: "Arroz Costeño 1kg", price: 5.50, costPrice: 4.20, category: "Abarrotes", unit: "bolsa", stock: 80, stockMin: 15, stockMax: 120 },
  { name: "Azúcar Rubia 1kg", price: 4.50, costPrice: 3.50, category: "Abarrotes", unit: "bolsa", stock: 60, stockMin: 10, stockMax: 100 },
  { name: "Aceite Vegetal Primor 1L", price: 9.90, costPrice: 7.50, category: "Abarrotes", unit: "botella", stock: 30, stockMin: 8, stockMax: 50 },
  { name: "Fideos Spaghetti Don Vittorio 500g", price: 3.80, costPrice: 2.80, category: "Abarrotes", unit: "paquete", stock: 45, stockMin: 10, stockMax: 70 },
  { name: "Sal Yodada Emsal 1kg", price: 2.00, costPrice: 1.20, category: "Abarrotes", unit: "bolsa", stock: 40, stockMin: 10, stockMax: 60 },
  { name: "Avena 3 Ositos 500g", price: 4.50, costPrice: 3.20, category: "Abarrotes", unit: "bolsa", stock: 25, stockMin: 5, stockMax: 40 },
  { name: "Lentejas 500g", price: 4.00, costPrice: 3.00, category: "Abarrotes", unit: "bolsa", stock: 20, stockMin: 5, stockMax: 35 },
  { name: "Atún Florida 170g", price: 5.50, costPrice: 4.00, category: "Conservas", unit: "lata", stock: 35, stockMin: 8, stockMax: 60 },
  { name: "Leche Evaporada Gloria 400ml", price: 4.80, costPrice: 3.80, category: "Lácteos", unit: "lata", stock: 60, stockMin: 15, stockMax: 100 },
  // Bebidas
  { name: "Coca-Cola 1.5L", price: 8.00, costPrice: 5.50, category: "Bebidas", unit: "botella", stock: 40, stockMin: 10, stockMax: 60 },
  { name: "Agua San Luis 2.5L", price: 3.50, costPrice: 2.00, category: "Bebidas", unit: "botella", stock: 30, stockMin: 8, stockMax: 50 },
  { name: "Inca Kola 1.5L", price: 8.00, costPrice: 5.50, category: "Bebidas", unit: "botella", stock: 38, stockMin: 10, stockMax: 60 },
  { name: "Cerveza Pilsen Pack x6", price: 18.00, costPrice: 13.50, category: "Bebidas", unit: "pack", stock: 15, stockMin: 5, stockMax: 30 },
  { name: "Yogurt Gloria Natural 1L", price: 7.50, costPrice: 5.50, category: "Lácteos", unit: "botella", stock: 25, stockMin: 5, stockMax: 40 },
  { name: "Chicha Morada Naturale 1L", price: 5.00, costPrice: 3.50, category: "Bebidas", unit: "botella", stock: 20, stockMin: 5, stockMax: 35 },
  // Limpieza
  { name: "Detergente Ariel 2kg", price: 15.00, costPrice: 11.00, category: "Limpieza", unit: "bolsa", stock: 20, stockMin: 5, stockMax: 35 },
  { name: "Lejía Clorox 1L", price: 4.50, costPrice: 3.00, category: "Limpieza", unit: "botella", stock: 25, stockMin: 5, stockMax: 40 },
  { name: "Jabón Bolívar en Barra", price: 3.00, costPrice: 2.00, category: "Limpieza", unit: "barra", stock: 30, stockMin: 8, stockMax: 50 },
  { name: "Papel Higiénico Elite x4", price: 8.00, costPrice: 5.50, category: "Limpieza", unit: "paquete", stock: 20, stockMin: 5, stockMax: 35 },
  { name: "Lavavajillas Ayudín 500ml", price: 5.50, costPrice: 3.80, category: "Limpieza", unit: "botella", stock: 15, stockMin: 3, stockMax: 25 },
  // Lácteos
  { name: "Leche Gloria Entera 1L", price: 7.00, costPrice: 5.50, category: "Lácteos", unit: "caja", stock: 40, stockMin: 10, stockMax: 60 },
  { name: "Mantequilla Laive 200g", price: 6.00, costPrice: 4.50, category: "Lácteos", unit: "barra", stock: 15, stockMin: 3, stockMax: 25 },
  { name: "Queso Fresco 250g", price: 8.00, costPrice: 6.00, category: "Lácteos", unit: "unidad", stock: 10, stockMin: 3, stockMax: 20 },
  // Carnes
  { name: "Pollo Entero 1kg", price: 12.00, costPrice: 9.00, category: "Carnes", unit: "kg", stock: 8, stockMin: 3, stockMax: 15 },
  { name: "Carne de Res 1kg", price: 28.00, costPrice: 22.00, category: "Carnes", unit: "kg", stock: 5, stockMin: 2, stockMax: 10 },
  // Frutas y verduras
  { name: "Tomates Frescos 1kg", price: 3.50, costPrice: 2.00, category: "Frutas y Verduras", unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
  { name: "Cebollas Rojas 1kg", price: 3.00, costPrice: 1.80, category: "Frutas y Verduras", unit: "kg", stock: 25, stockMin: 5, stockMax: 35 },
  { name: "Papas Nativas 1kg", price: 4.00, costPrice: 2.50, category: "Frutas y Verduras", unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
  { name: "Plátanos de Seda 1kg", price: 2.50, costPrice: 1.50, category: "Frutas y Verduras", unit: "kg", stock: 20, stockMin: 5, stockMax: 30 },
  { name: "Palta Hass", price: 5.00, costPrice: 3.50, category: "Frutas y Verduras", unit: "unidad", stock: 15, stockMin: 3, stockMax: 25 },
  { name: "Zanahoria 1kg", price: 2.50, costPrice: 1.50, category: "Frutas y Verduras", unit: "kg", stock: 20, stockMin: 5, stockMax: 30 },
  { name: "Limones 1kg", price: 5.00, costPrice: 3.00, category: "Frutas y Verduras", unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
  // Snacks
  { name: "Galletas Oreo 6pk", price: 4.50, costPrice: 3.20, category: "Snacks", unit: "paquete", stock: 25, stockMin: 5, stockMax: 40 },
  { name: "Chocolate Sublime", price: 2.50, costPrice: 1.80, category: "Snacks", unit: "unidad", stock: 30, stockMin: 8, stockMax: 50 },
  // Otros
  { name: "Huevos x30", price: 15.00, costPrice: 11.00, category: "Abarrotes", unit: "bandeja", stock: 10, stockMin: 3, stockMax: 20 },
  { name: "Pan Integral 500g", price: 5.00, costPrice: 3.50, category: "Panadería", unit: "paquete", stock: 15, stockMin: 3, stockMax: 25 },
  { name: "Café Instantáneo Nescafé 200g", price: 12.00, costPrice: 9.00, category: "Abarrotes", unit: "frasco", stock: 10, stockMin: 3, stockMax: 20 },
  { name: "Sillao Kikko 500ml", price: 4.50, costPrice: 3.00, category: "Abarrotes", unit: "botella", stock: 15, stockMin: 3, stockMax: 25 },
  { name: "Vinagre Venturo 500ml", price: 3.50, costPrice: 2.20, category: "Abarrotes", unit: "botella", stock: 15, stockMin: 3, stockMax: 25 },
];

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-demo-products"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // SECURITY: count scoped al tenant. Sin esto, un tenant nuevo veía
    // currentCount=30 (de otro tenant) y nunca se sembraban sus demos.
    // eslint-disable-next-line no-restricted-properties -- count scoped por tenantId. Refactor a ProductsDB pendiente.
    const currentCount = await prisma.product.count({ where: { tenantId: auth.tenantId } });
    if (currentCount >= 10) {
      return NextResponse.json({
        created: 0,
        message: `Ya existen ${currentCount} productos. No se crearon productos demo para evitar duplicados.`,
      });
    }

    let created = 0;
    for (const p of PRODUCTOS_BODEGA) {
      // eslint-disable-next-line no-restricted-properties -- create scoped por tenantId del auth. Refactor a ProductsDB.create pendiente.
      await prisma.product.create({
        data: {
          tenantId: auth.tenantId,
          name: p.name,
          category: p.category,
          price: p.price,
          costPrice: p.costPrice,
          unit: p.unit,
          stock: p.stock,
          stockMin: p.stockMin,
          stockMax: p.stockMax,
          image: "",
          active: true,
          barcode: `7750${Math.floor(100000 + Math.random() * 900000)}`,
        },
      });
      created++;
    }

    return NextResponse.json({
      created,
      message: `${created} productos de bodega peruana creados exitosamente`,
    });
  } catch (e) {
    logger.error("[demo-products] POST error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al crear productos demo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-demo-products"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // CRITICAL FIX 2026-05-11 (audit P0 — cross-tenant wipe):
    // Antes, los deleteMany se ejecutaban con `productId: { in: DEMO_IDS }` sin
    // tenantId, lo que destruía productos 1-24 y todo su historial (OrderItem,
    // SaleItem, InventoryMovement) en TODOS los tenants. Cualquier admin podía
    // disparar este DELETE y borrar inventario y ventas de la competencia.
    //
    // Fix: filtrar primero por (id IN DEMO_IDS AND tenantId = auth.tenantId)
    // y usar el set resultante en los borrados de children. Tablas con
    // tenantId propio reciben filtro doble.
    // eslint-disable-next-line no-restricted-properties -- ownership lookup scoped por tenantId. Refactor a ProductsDB pendiente.
    const ownedProducts = await prisma.product.findMany({
      where: { id: { in: DEMO_IDS }, tenantId: auth.tenantId },
      select: { id: true },
    });
    const ownedIds = ownedProducts.map((p) => p.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    /* eslint-disable no-restricted-properties, no-restricted-syntax -- $transaction cascada de borrado para FK-dependientes (ADR-101 modelos indirectos). productIds pre-filtrados al tenantId arriba; los modelos sin tenantId propio se borran solo para los IDs del tenant del autorizador. */
    await prisma.$transaction([
      // BundleItem / SaleItem / PurchaseItem / OrderItem: no tienen tenantId
      // directo (ADR-101), pero los productIds vienen pre-filtrados al tenant.
      prisma.bundleItem.deleteMany({ where: { productId: { in: ownedIds } } }),
      prisma.priceHistory.deleteMany({ where: { productId: { in: ownedIds }, tenantId: auth.tenantId } }),
      prisma.inventoryMovement.deleteMany({ where: { productId: { in: ownedIds }, tenantId: auth.tenantId } }),
      prisma.saleItem.deleteMany({ where: { productId: { in: ownedIds } } }),
      prisma.purchaseItem.deleteMany({ where: { productId: { in: ownedIds } } }),
      prisma.orderItem.deleteMany({ where: { productId: { in: ownedIds } } }),
    ]);
    const { count } = await prisma.product.deleteMany({
      where: { id: { in: ownedIds }, tenantId: auth.tenantId },
    });
    /* eslint-enable no-restricted-properties, no-restricted-syntax */
    return NextResponse.json({ ok: true, deleted: count });
  } catch (e) {
    logger.error("[demo-products] DELETE error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al eliminar productos de ejemplo" }, { status: 500 });
  }
}
