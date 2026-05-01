/**
 * Agrega tipAmount a DeliveryAssignment. Idempotente.
 * Uso: npx tsx -r dotenv/config scripts/add-tip-column.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DeliveryAssignment" ADD COLUMN IF NOT EXISTS "tipAmount" DECIMAL(12,2) DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DeliveryAssignment" ADD COLUMN IF NOT EXISTS "tipMessage" TEXT`,
  );
  console.log("✓ DeliveryAssignment.tipAmount + tipMessage");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
