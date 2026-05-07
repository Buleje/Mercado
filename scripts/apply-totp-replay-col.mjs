// FIX 2026-05-06 (pentest H002): TOTP replay protection — agregar columna
// `totpLastUsedStep` para persistir el último step consumido y rechazar reuse.
import pg from "pg";
const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    ALTER TABLE "AdminUser"
      ADD COLUMN IF NOT EXISTS "totpLastUsedStep" INTEGER;
  `);
  console.log("✅ AdminUser.totpLastUsedStep agregado");

  await client.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
