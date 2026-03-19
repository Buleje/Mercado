/**
 * One-time migration: backfills tenantId = 'main' for all ActivityLog rows
 * created before the tenantId column was added with @default("main").
 *
 * Usage: npx tsx scripts/migrate-activity-log-tenant.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const result = await prisma.$executeRaw`
    UPDATE "ActivityLog"
    SET    "tenantId" = 'main'
    WHERE  "tenantId" IS NULL
  `;
  console.log(`✅ Backfilled ${result} ActivityLog row(s) to tenantId = 'main'`);
}

main()
  .catch(err => { console.error("Migration failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
