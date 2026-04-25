import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const before = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Store' AND column_name IN ('lat','lng');
`);
console.log("Before:", before.rows.map((r) => r.column_name));

await client.query(`ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;`);
await client.query(`ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;`);

const after = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Store' AND column_name IN ('lat','lng');
`);
console.log("After: ", after.rows.map((r) => r.column_name));

await client.end();
console.log("OK");
