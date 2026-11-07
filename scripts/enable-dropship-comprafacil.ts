// ADR-298 Fase 2 — Habilita dropshipping en CompraFácil + proveedor demo + linkea
// productos + crea un pedido de prueba (pendiente) para verificar el hook E2E.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/enable-dropship-comprafacil.ts
import { prisma } from "../lib/prisma";

const SLUG = "comprafacil";
const SUPPLIER_ID = "sup-dropship-demo";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!tenant) throw new Error("Tenant comprafacil no existe (corré create-comprafacil primero).");
  const tenantId = tenant.id;

  // 1) Activar dropship
  await prisma.settings.updateMany({ where: { tenantId }, data: { dropshipEnabled: true } });
  console.log("✅ dropshipEnabled=true en CompraFácil");

  // 2) Proveedor demo (idempotente)
  await prisma.supplier.upsert({
    where: { id: SUPPLIER_ID },
    update: {},
    create: { id: SUPPLIER_ID, tenantId, name: "Proveedor Dropship Demo", email: "proveedor@demo.com", estado: "activo" },
  });
  console.log("✅ Proveedor demo:", SUPPLIER_ID);

  // 3) Marcar productos como dropship + vincular al proveedor
  const products = await prisma.product.findMany({ where: { tenantId }, select: { id: true, name: true, costPrice: true } });
  for (const p of products) {
    await prisma.product.update({
      where: { id: p.id },
      data: {
        isDropship: true,
        dropshipSupplierId: SUPPLIER_ID,
        supplierSku: `CF-${p.id}`,
        // costo al proveedor = 55% del precio (margen demo) si no tenía costPrice
        costPrice: p.costPrice ?? undefined,
      },
    });
  }
  console.log(`✅ ${products.length} productos marcados dropship + linkeados`);

  // 3b) Set costPrice donde falte (para que el costo al proveedor no sea 0)
  await prisma.$executeRawUnsafe(
    `UPDATE "Product" SET "costPrice" = ROUND("price" * 0.55, 2) WHERE "tenantId" = $1 AND "costPrice" IS NULL`,
    tenantId,
  );

  // 4) Pedido de prueba (pendiente) con 2 ítems dropship
  const orderId = `dropshiptest-${products[0]?.id ?? "x"}-${Math.floor(Math.random() * 1e6)}`;
  const picked = products.slice(0, 2);
  const existing = await prisma.order.findFirst({ where: { tenantId, customerName: "Cliente Demo Dropship" }, select: { id: true } });
  if (existing) {
    console.log("• Ya existe un pedido de prueba:", existing.id);
  } else {
    const prods = await prisma.product.findMany({ where: { id: { in: picked.map((p) => p.id) } }, select: { id: true, name: true, price: true, costPrice: true } });
    const total = prods.reduce((s, p) => s + Number(p.price), 0);
    await prisma.order.create({
      data: {
        id: orderId,
        tenantId,
        customerName: "Cliente Demo Dropship",
        customerPhone: "999111222",
        customerLocation: "Av. Siempre Viva 742, Ciudad Constitución",
        customerReference: "Casa azul, portón negro",
        total,
        status: "pendiente",
        items: {
          create: prods.map((p) => ({
            productId: p.id, name: p.name, price: p.price, costPrice: p.costPrice ?? undefined, quantity: 1, unit: "unidad",
          })),
        },
      },
    });
    console.log(`✅ Pedido de prueba creado: ${orderId} (status pendiente, ${prods.length} ítems)`);
  }

  console.log("\nAhora: en el admin de CompraFácil, mové el pedido a 'Confirmado' → el hook crea el DropshipFulfillment.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
