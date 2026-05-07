// Aplica migración 20260505000000_add_preparando_status_and_delivery_proof
// directamente. Requiere DIRECT_URL (puerto 5432, sin pgBouncer).
import pg from "pg";
const { Client } = pg;

async function main() {
  // Intentamos DIRECT_URL (puerto 5432) primero; si falla por IPv6, fallback a DATABASE_URL (pgBouncer)
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("=== Antes ===");
  const before = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'DeliveryAssignment' order by ordinal_position`,
  );
  console.log(before.rows.map((r) => r.column_name).join(", "));

  console.log("\n=== Aplicando ALTER TABLE ===");
  await client.query(`
    ALTER TABLE "DeliveryAssignment"
      ADD COLUMN IF NOT EXISTS "routeStartedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "proofPhotoUrl" TEXT;
  `);
  console.log("✅ DeliveryAssignment columnas agregadas");

  // Verificar enum OrderStatus
  console.log("\n=== Verificando enum OrderStatus ===");
  const { rows: enums } = await client.query(`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
    ORDER BY enumsortorder
  `);
  const labels = enums.map((r) => r.enumlabel);
  console.log("Valores actuales:", labels.join(", "));

  if (!labels.includes("preparando")) {
    // ALTER TYPE no se puede dentro de transacción. pg client por default no usa tx, así que ok.
    await client.query(`ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'preparando' BEFORE 'en_camino'`);
    console.log("✅ enum 'preparando' agregado");
  } else {
    console.log("✓ 'preparando' ya existe");
  }

  // Marcar como aplicada en _prisma_migrations
  console.log("\n=== Marcando migración como aplicada ===");
  const migrationName = "20260505000000_add_preparando_status_and_delivery_proof";
  const { rows: existing } = await client.query(
    `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
    [migrationName],
  );
  if (existing.length === 0) {
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, 'manual-apply', NOW(), $1, NOW(), 1)`,
      [migrationName],
    );
    console.log(`✅ Marcada ${migrationName} en _prisma_migrations`);
  } else {
    console.log(`✓ ${migrationName} ya marcada`);
  }

  console.log("\n=== Después ===");
  const after = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'DeliveryAssignment' order by ordinal_position`,
  );
  console.log(after.rows.map((r) => r.column_name).join(", "));

  await client.end();
  console.log("\n🎉 Migración aplicada");
}

main().catch((e) => {
  console.error("❌ FATAL:", e.message);
  process.exit(1);
});
