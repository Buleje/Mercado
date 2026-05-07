#!/usr/bin/env node
/**
 * apply-misc-schema-drift.mjs
 *
 * Aplica columnas faltantes que estan en schema.prisma pero no en DB.
 * Solo cubre los casos críticos detectados por check-schema-drift.mjs:
 *   - AdminUser.totpSecret / totpEnabledAt  (2FA)
 *   - StoreBanner.section                   (segmentación de banners)
 *
 * El resto del drift requiere `prisma migrate dev` en red con DIRECT_URL.
 */
import pg from "pg";
const { Client } = pg;

const FIXES = [
  {
    name: "AdminUser.totpSecret + totpEnabledAt",
    sql: `
      ALTER TABLE "AdminUser"
        ADD COLUMN IF NOT EXISTS "totpSecret"    TEXT,
        ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3);
    `,
  },
  {
    name: "StoreBanner.section",
    sql: `
      ALTER TABLE "StoreBanner"
        ADD COLUMN IF NOT EXISTS "section" TEXT;
    `,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const f of FIXES) {
    process.stdout.write(`▶ ${f.name} ... `);
    try {
      await client.query(f.sql);
      console.log("✅");
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  await client.end();
  console.log("\n✅ Cambios aplicados (idempotente con IF NOT EXISTS)");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
