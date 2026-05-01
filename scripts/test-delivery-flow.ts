/**
 * E2E manual test del flujo Rappi-style:
 *   1. Aprobar partner Test Repartidor (creado anteriormente con phone=999333222)
 *   2. Setear isOnline=true + GPS Pucallpa
 *   3. Disparar createNextOffer para una orden
 *   4. Verificar que se creó la oferta
 *   5. Cleanup
 *
 * Uso: npx tsx -r dotenv/config scripts/test-delivery-flow.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";
import { createNextOffer } from "../lib/delivery/offer-cascade";

const PHONE = "999333222";
const TENANT = "main";

async function main() {
  // 1. Buscar/aprobar partner.
  let partner = await prisma.deliveryPartner.findFirst({
    where: { phone: PHONE, tenantId: TENANT },
  });
  if (!partner) {
    partner = await prisma.deliveryPartner.create({
      data: {
        name: "Test Repartidor",
        phone: PHONE,
        zone: "Centro",
        vehicleType: "moto",
        isActive: true,
        tenantId: TENANT,
        rating: 5.0,
        fee: 5.0,
      },
    });
    console.log("✓ Partner creado:", partner.id);
  } else {
    console.log("✓ Partner existente:", partner.id);
  }

  await prisma.deliveryPartner.update({
    where: { id: partner.id },
    data: {
      isActive: true,
      isOnline: true,
      lat: -8.379,
      lng: -74.553,
      lastPingAt: new Date(),
      currentOrderId: null,
    },
  });
  console.log("✓ Partner online + GPS Pucallpa");

  // 2. Buscar una order existente del tenant main (cualquiera con location)
  const order = await prisma.order.findFirst({
    where: { tenantId: TENANT },
    select: { id: true, tenantId: true, customerLocation: true },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    console.error("No hay orders con location en tenant main");
    return;
  }
  console.log("✓ Order target:", order.id);

  // 3. Limpiar offers previas de este order para test limpio.
  await prisma.deliveryOffer.deleteMany({
    where: { orderId: order.id },
  });

  // 4. Trigger cascade.
  const result = await createNextOffer(order, -8.379, -74.553);
  if (!result) {
    console.error("❌ No se creó oferta — verificar candidatos");
    return;
  }
  console.log("✓ Oferta creada:", result);

  // 5. Verificar en DB.
  const offer = await prisma.deliveryOffer.findUnique({
    where: { id: result.offerId },
    select: {
      id: true, status: true, expiresAt: true, distanceKm: true,
      feeOffered: true, attempt: true,
    },
  });
  console.log("✓ Oferta DB:", offer);

  // 6. Cleanup test data.
  await prisma.deliveryOffer.deleteMany({
    where: { orderId: order.id, partnerId: partner.id },
  });
  await prisma.deliveryPartner.update({
    where: { id: partner.id },
    data: { isOnline: false, isActive: false },
  });
  console.log("\n🎉 E2E test completo. Cleanup OK.");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
