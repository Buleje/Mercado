/**
 * scripts/seed-delivery-demo.ts
 *
 * Seed de datos de demostración para el Bloque D1 (Delivery vivo).
 * Crea 1 ruta + 3 paradas + 5 eventos de tracking con coordenadas reales de Pucallpa.
 *
 * Uso:
 *   npx tsx scripts/seed-delivery-demo.ts
 *   npx tsx scripts/seed-delivery-demo.ts --tenant demo
 *
 * Requisitos:
 *   - DATABASE_URL debe apuntar a la base donde ya se aplicó MANUAL-marketplace-bloque-d1.sql
 *   - Debe existir al menos 1 Store y 3 Orders del tenant destino
 *
 * Notas:
 *   - Idempotente por orderId: si ya existe tracking para ese order, lo saltea
 *   - Los datos son ficticios (nombres, direcciones reales de Pucallpa + números falsos)
 */

import {
  DeliveryTrackingDB,
  DeliveryRoutesDB,
  DeliveryRouteStopsDB,
} from "../lib/db/delivery.db";
import { prisma } from "../lib/prisma";

// ─── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const tenantArgIdx = args.indexOf("--tenant");
const TENANT_ID = tenantArgIdx >= 0 ? args[tenantArgIdx + 1] ?? "main" : "main";

// Coordenadas reales de Pucallpa (tienda central + 3 destinos en el centro)
const PICKUP = { lat: -8.3791, lng: -74.5539, name: "Bodega San Martín (origen)" };
const DESTINATIONS = [
  {
    address: "Jr. Progreso 245, Pucallpa",
    detail: "Casa amarilla con portón blanco",
    lat: -8.3803,
    lng: -74.5521,
    customerName: "María López García",
    customerPhone: "+51987654321",
  },
  {
    address: "Jr. Inmaculada 578, Pucallpa",
    detail: "2do piso, timbre 3",
    lat: -8.3845,
    lng: -74.5489,
    customerName: "Carlos Ruiz Mendoza",
    customerPhone: "+51987123456",
  },
  {
    address: "Av. Centenario 1234, Pucallpa",
    detail: "Al costado del minimarket",
    lat: -8.3712,
    lng: -74.5601,
    customerName: "Ana Flores Vega",
    customerPhone: "+51912345678",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesFromNow(m: number): Date {
  return new Date(Date.now() + m * 60_000);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Seed delivery demo → tenant="${TENANT_ID}"\n`);

  // 1. Validar Store
  const store = await prisma.store.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
  });
  if (!store) {
    console.error(`❌ No hay Store para tenantId="${TENANT_ID}". Corré primero npm run db:seed o registrá una tienda.`);
    process.exit(1);
  }
  console.log(`✅ Store: ${store.name} (${store.id})`);

  // 2. Validar que haya al menos 3 Orders del tenant
  const orders = await prisma.order.findMany({
    where: { tenantId: TENANT_ID, deletedAt: null },
    select: { id: true, customerName: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  if (orders.length < 3) {
    console.error(`❌ Se necesitan ≥3 Orders del tenant "${TENANT_ID}" para asignar paradas. Hay ${orders.length}.`);
    console.error(`   Corré primero un seed de orders o creá pedidos manualmente.`);
    process.exit(1);
  }
  console.log(`✅ ${orders.length} orders encontrados: ${orders.map((o) => o.id).join(", ")}`);

  // 3. Crear la ruta del día
  console.log("\n📦 Creando ruta...");
  const route = await DeliveryRoutesDB.create({
    tenantId: TENANT_ID,
    storeId: store.id,
    driverId: "demo-driver-1",
    driverName: "Luis Mendoza",
    driverPhone: "+51999888777",
    vehicleType: "moto",
    plannedStartAt: minutesFromNow(10),
    totalDistanceM: 4200,
    notes: "Ruta demo del bloque D1",
  });
  console.log(`   ✓ Ruta ${route.id} creada`);

  // 4. Agregar 3 paradas en orden
  console.log("\n📍 Agregando paradas...");
  for (let i = 0; i < 3; i++) {
    const dest = DESTINATIONS[i]!;
    const order = orders[i]!;
    const stop = await DeliveryRouteStopsDB.addStop({
      tenantId: TENANT_ID,
      routeId: route.id,
      orderId: order.id,
      address: dest.address,
      addressDetail: dest.detail,
      lat: dest.lat,
      lng: dest.lng,
      customerName: order.customerName ?? dest.customerName,
      customerPhone: dest.customerPhone,
      estimatedArrivalAt: minutesFromNow(15 + i * 10),
    });
    console.log(`   ✓ Stop #${stop.sequence} → ${dest.address.substring(0, 40)}...`);
  }

  // 5. Emitir 5 eventos de tracking sobre el primer order (el "en vivo")
  const firstOrder = orders[0]!;
  console.log(`\n🚚 Emitiendo eventos de tracking para ${firstOrder.id}...`);

  const events = [
    { status: "preparing" as const, description: "Preparando el pedido en la tienda", distanceM: 4200, etaMinutes: 25 },
    { status: "ready" as const,     description: "Listo para recoger",                 distanceM: 4200, etaMinutes: 20 },
    { status: "picked_up" as const, description: "Repartidor recogió el paquete",      distanceM: 4000, etaMinutes: 18 },
    { status: "in_transit" as const, description: "En camino a tu domicilio",          distanceM: 2500, etaMinutes: 10 },
    { status: "nearby" as const,    description: "A 3 cuadras — el repartidor está por llegar", distanceM: 300, etaMinutes: 2 },
  ];

  for (const e of events) {
    await DeliveryTrackingDB.add({
      tenantId: TENANT_ID,
      orderId: firstOrder.id,
      status: e.status,
      description: e.description,
      lat: PICKUP.lat + (Math.random() - 0.5) * 0.005,
      lng: PICKUP.lng + (Math.random() - 0.5) * 0.005,
      distanceM: e.distanceM,
      etaMinutes: e.etaMinutes,
      actorId: "demo-driver-1",
      actorType: "driver",
    });
    console.log(`   ✓ ${e.status.padEnd(12)} — ${e.description}`);
  }

  console.log("\n✨ Seed completo.\n");
  console.log(`🔗 Probá el endpoint público:`);
  console.log(`   GET /api/track/${firstOrder.id}`);
  console.log(`🔗 Probá el feed admin:`);
  console.log(`   GET /api/admin/delivery/tracking`);
  console.log(`🔗 Probá la ruta:`);
  console.log(`   GET /api/admin/delivery/routes/${route.id}/stops\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Error en seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
