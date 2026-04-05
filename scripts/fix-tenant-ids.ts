/**
 * Script: Diagnose and fix tenantId inconsistencies
 * 
 * Problem: Some products have tenantId="main" (the slug) instead of the
 * actual CUID of the main tenant. This causes them to be invisible when
 * filtering by CUID (which is what the JWT session uses).
 *
 * Run: npx tsx scripts/fix-tenant-ids.ts
 * Dry-run (default): Shows what would change without modifying data
 * Apply: npx tsx scripts/fix-tenant-ids.ts --apply
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const isDryRun = !process.argv.includes("--apply");

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set. Export it first.");
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const resolvedUrl = !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;
  const adapter = new PrismaPg({
    connectionString: resolvedUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 2,
  });
  return new PrismaClient({ adapter });
}

async function main() {
  const prisma = createClient();
  console.log(isDryRun ? "🔍 DRY RUN — no changes will be made\n" : "🔧 APPLYING CHANGES\n");

  try {

  // 1. Get all tenants
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
  });

  console.log("📋 Tenants in system:");
  for (const t of tenants) {
    console.log(`  - ${t.name} (slug="${t.slug}", id="${t.id}")`);
  }
  console.log();

  const mainTenant = tenants.find(t => t.slug === "main");
  if (!mainTenant) {
    console.error("❌ No tenant with slug='main' found. Aborting.");
    process.exit(1);
  }

  // 2. Count products by tenantId
  const productCounts = await prisma.$queryRaw<Array<{ tenantId: string; count: bigint }>>`
    SELECT "tenantId", COUNT(*) as count FROM "Product" GROUP BY "tenantId" ORDER BY count DESC
  `;

  console.log("📦 Products by tenantId:");
  for (const row of productCounts) {
    const tenant = tenants.find(t => t.id === row.tenantId || t.slug === row.tenantId);
    const label = tenant ? `${tenant.name} (${tenant.slug})` : "UNKNOWN TENANT";
    const isSlug = tenants.some(t => t.slug === row.tenantId && t.id !== row.tenantId);
    console.log(`  tenantId="${row.tenantId}" → ${Number(row.count)} products — ${label}${isSlug ? " ⚠️ USES SLUG instead of CUID" : ""}`);
  }
  console.log();

  // 3. Find products using slug instead of CUID
  const slugBasedTenants = tenants.filter(t => t.id !== t.slug);
  let totalFixed = 0;

  for (const tenant of slugBasedTenants) {
    const productsWithSlug = await prisma.product.count({
      where: { tenantId: tenant.slug },
    });

    if (productsWithSlug === 0) continue;

    console.log(`🔧 Tenant "${tenant.name}": ${productsWithSlug} products use slug="${tenant.slug}" instead of CUID="${tenant.id}"`);

    if (!isDryRun) {
      const result = await prisma.product.updateMany({
        where: { tenantId: tenant.slug },
        data: { tenantId: tenant.id },
      });
      console.log(`  ✅ Updated ${result.count} products`);
      totalFixed += result.count;
    } else {
      console.log(`  → Would update ${productsWithSlug} products`);
      totalFixed += productsWithSlug;
    }
  }

  // 4. Also check other tables with tenantId for the same issue
  const tablesToCheck = [
    "Order", "Sale", "Promotion", "Coupon", "Supplier",
    "InventoryMovement", "Batch", "Warehouse", "Category",
  ];

  console.log("\n📊 Other tables with slug-based tenantId:");
  for (const table of tablesToCheck) {
    try {
      for (const tenant of slugBasedTenants) {
        const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*) as count FROM "${table}" WHERE "tenantId" = $1`,
          tenant.slug
        );
        const n = Number(count[0]?.count ?? 0);
        if (n > 0) {
          console.log(`  ⚠️  ${table}: ${n} rows with tenantId="${tenant.slug}" (should be "${tenant.id}")`);
          if (!isDryRun) {
            await prisma.$executeRawUnsafe(
              `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" = $2`,
              tenant.id,
              tenant.slug
            );
            console.log(`    ✅ Fixed ${n} rows`);
          }
        }
      }
    } catch {
      // Table might not exist or not have tenantId — skip
    }
  }

  console.log(`\n${isDryRun ? "📝 Total to fix" : "✅ Total fixed"}: ${totalFixed} products`);
  if (isDryRun && totalFixed > 0) {
    console.log("\n💡 Run with --apply to make changes:");
    console.log("   npx tsx scripts/fix-tenant-ids.ts --apply");
  }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
