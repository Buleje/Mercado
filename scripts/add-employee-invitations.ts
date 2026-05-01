/**
 * Crea tabla EmployeeInvitation. Idempotente.
 * Uso: npx tsx -r dotenv/config scripts/add-employee-invitations.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmployeeInvitation" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "token" TEXT UNIQUE NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "acceptedAt" TIMESTAMP(3),
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "EmployeeInvitation_tenantId_idx" ON "EmployeeInvitation"("tenantId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "EmployeeInvitation_status_idx" ON "EmployeeInvitation"("status")`,
  );
  console.log("✓ EmployeeInvitation table + indexes");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
