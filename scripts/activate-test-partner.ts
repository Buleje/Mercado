/**
 * Activa partner test para E2E (isActive=true).
 * SLUG=PHONE env vars; default phone=999333222.
 */
import { prisma } from "../lib/prisma";

const PHONE = process.env.PHONE || "999333222";

async function main() {
  const r = await prisma.deliveryPartner.updateMany({
    where: { phone: PHONE, tenantId: "main" },
    data: { isActive: true },
  });
  console.log(`Activated ${r.count} partner(s) with phone=${PHONE}`);
}

main().finally(() => prisma.$disconnect());
