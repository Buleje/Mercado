/**
 * Prisma seed script — creates the default "main" tenant so that
 * all existing single-store data (tenantId = "main") has a valid
 * Tenant record to reference.
 *
 * Run with:
 *   npx tsx prisma/seed.ts
 *   or add to package.json: "prisma": { "seed": "tsx prisma/seed.ts" }
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  const resolvedUrl =
    !isLocal && !connectionString.includes("pgbouncer=true")
      ? connectionString +
        (connectionString.includes("?") ? "&" : "?") +
        "pgbouncer=true"
      : connectionString;

  const adapter = new PrismaPg({
    connectionString: resolvedUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.tenant.findUnique({
      where: { slug: "main" },
    });

    if (!existing) {
      await prisma.tenant.create({
        data: {
          slug: "main",
          name: "Bodega San Martín",
          plan: "pro",
          active: true,
          ownerPhone: process.env.NOTIFY_PHONE ?? undefined,
          ownerEmail: process.env.NOTIFY_EMAIL ?? undefined,
        },
      });
      console.log("✅  Default tenant 'main' created (Bodega San Martín)");
    } else {
      console.log("ℹ️   Default tenant 'main' already exists — skipping");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
