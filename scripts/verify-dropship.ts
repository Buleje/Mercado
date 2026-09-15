// Verifica el hook real: corre DropshipDB.createFulfillmentsFromOrder (la MISMA
// función que dispara orders.db al confirmar) contra el pedido de prueba de
// CompraFácil, y lee el resultado. Uso:
// DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-dropship.ts
import { prisma } from "../lib/prisma";
import { DropshipDB } from "../lib/db/dropship.db";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "comprafacil" }, select: { id: true } });
  if (!tenant) throw new Error("comprafacil no existe");
  const tenantId = tenant.id;

  console.log("dropshipEnabled?", await DropshipDB.isEnabled(tenantId));

  const order = await prisma.order.findFirst({
    where: { tenantId, customerName: "Cliente Demo Dropship" },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("pedido de prueba no existe (corré enable-dropship-comprafacil)");
  console.log("Pedido prueba:", order.id, "status:", order.status);

  // ESTA es la función que el hook de orders.db invoca al confirmar:
  const created = await DropshipDB.createFulfillmentsFromOrder(tenantId, order.id);
  console.log("→ fulfillments creados ahora:", created);

  const rows = await DropshipDB.listFulfillments(tenantId);
  console.log("\nFulfillments en CompraFácil:", rows.length);
  for (const r of rows) {
    const items = JSON.parse(r.itemsJson) as Array<{ name: string; qty: number; unitCost: number }>;
    console.log(`  · pedido ${r.orderId.slice(0, 12)} | proveedor ${r.supplierId} | estado ${r.status} | costo S/${Number(r.costTotal).toFixed(2)} | envío a ${r.shipName} (${r.shipLocation})`);
    items.forEach((it) => console.log(`      - ${it.qty}× ${it.name} @ costo S/${it.unitCost}`));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
