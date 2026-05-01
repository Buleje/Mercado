/**
 * Aplica los nuevos campos de DeliveryPartner + DeliveryOffer a la DB
 * via SQL directo. Idempotente: chequea existencia antes de cada ALTER.
 *
 * Uso: npx tsx -r dotenv/config scripts/push-delivery-schema.ts dotenv_config_path=.env.local
 *
 * Solo ALTER TABLE / CREATE TABLE — sin DROP. Sin data loss posible.
 */
import { prisma } from "../lib/prisma";

async function main() {
  // Campos nuevos en DeliveryPartner — todos NULLABLE / con DEFAULT.
  const additions: Array<{ col: string; sql: string }> = [
    { col: "passwordHash", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT` },
    { col: "lat", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION` },
    { col: "lng", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION` },
    { col: "lastPingAt", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "lastPingAt" TIMESTAMP(3)` },
    { col: "isOnline", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN NOT NULL DEFAULT false` },
    { col: "currentOrderId", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "currentOrderId" TEXT` },
    { col: "acceptanceRate", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0` },
    { col: "maxRadiusKm", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "maxRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5.0` },
    { col: "totalOffers", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "totalOffers" INTEGER NOT NULL DEFAULT 0` },
    { col: "totalAccepted", sql: `ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "totalAccepted" INTEGER NOT NULL DEFAULT 0` },
  ];

  for (const { col, sql } of additions) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`✓ DeliveryPartner.${col}`);
  }

  // Indice nuevo para matchmaking queries.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DeliveryPartner_tenantId_isOnline_currentOrderId_idx" ON "DeliveryPartner"("tenantId", "isOnline", "currentOrderId")`,
  );
  console.log(`✓ DeliveryPartner index tenantId+isOnline+currentOrderId`);

  // Tabla DeliveryOffer.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeliveryOffer" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "orderId"     TEXT NOT NULL,
      "partnerId"   TEXT NOT NULL,
      "status"      TEXT NOT NULL DEFAULT 'pending',
      "offeredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt"   TIMESTAMP(3) NOT NULL,
      "respondedAt" TIMESTAMP(3),
      "distanceKm"  DOUBLE PRECISION NOT NULL,
      "feeOffered"  DECIMAL(12,2) NOT NULL,
      "attempt"     INTEGER NOT NULL DEFAULT 1,
      "tenantId"    TEXT NOT NULL
    )
  `);
  console.log(`✓ DeliveryOffer table`);

  // FKs
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryOffer_orderId_fkey'
      ) THEN
        ALTER TABLE "DeliveryOffer"
          ADD CONSTRAINT "DeliveryOffer_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryOffer_partnerId_fkey'
      ) THEN
        ALTER TABLE "DeliveryOffer"
          ADD CONSTRAINT "DeliveryOffer_partnerId_fkey"
          FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log(`✓ DeliveryOffer FKs`);

  // Indices
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeliveryOffer_orderId_status_idx" ON "DeliveryOffer"("orderId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeliveryOffer_partnerId_status_idx" ON "DeliveryOffer"("partnerId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeliveryOffer_status_expiresAt_idx" ON "DeliveryOffer"("status", "expiresAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeliveryOffer_tenantId_idx" ON "DeliveryOffer"("tenantId")`);
  console.log(`✓ DeliveryOffer indices`);

  console.log("\n🎉 Schema delivery aplicado correctamente.");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
