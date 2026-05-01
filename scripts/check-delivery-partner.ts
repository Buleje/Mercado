/**
 * Lista DeliveryPartners por phone o por slug del tenant.
 * Uso: PHONE=999333222 npx tsx -r dotenv/config scripts/check-delivery-partner.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const PHONE = process.env.PHONE;
const TENANT = process.env.TENANT || "main";

async function main() {
  const where: Record<string, unknown> = { tenantId: TENANT };
  if (PHONE) where.phone = PHONE;
  const partners = await prisma.deliveryPartner.findMany({
    where,
    select: {
      id: true, name: true, phone: true, email: true, zone: true,
      vehicleType: true, isActive: true, rating: true, createdAt: true, notes: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(JSON.stringify(partners, null, 2));
}

main().finally(() => prisma.$disconnect());
