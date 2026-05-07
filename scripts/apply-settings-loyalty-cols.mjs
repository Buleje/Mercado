// FIX 2026-05-06 (audit team H022): persistir loyalty rules en DB en vez
// de localStorage. Expand puro nullable, sin backfill required.
import pg from "pg";
const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    ALTER TABLE "Settings"
      ADD COLUMN IF NOT EXISTS "loyaltyRulesJson"   TEXT,
      ADD COLUMN IF NOT EXISTS "loyaltyRewardsJson" TEXT;
  `);
  console.log("✅ Settings.loyaltyRulesJson + loyaltyRewardsJson agregados");

  await client.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
