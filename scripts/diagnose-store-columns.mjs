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

const { rows } = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'Store'
  ORDER BY ordinal_position;
`);

console.log("\n=== Columns in 'Store' table ===");
rows.forEach((r) => {
  console.log(`  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(20)} ${r.is_nullable}`);
});

const needed = [
  "id", "tenantId", "slug", "name", "description", "logo", "banner",
  "category", "zone", "lat", "lng", "rating", "reviewCount",
  "isPublished", "vacationMode", "vacationMessage", "commission",
  "createdAt", "updatedAt",
];
const have = new Set(rows.map((r) => r.column_name));
const missing = needed.filter((c) => !have.has(c));
console.log(`\nMissing columns vs schema.prisma: ${missing.length === 0 ? "(none)" : missing.join(", ")}`);

const { rows: stores } = await client.query(`SELECT COUNT(*)::int AS n FROM "Store";`);
console.log(`\nTotal Stores: ${stores[0].n}`);

const { rows: pub } = await client.query(`SELECT "isPublished", COUNT(*)::int AS n FROM "Store" GROUP BY "isPublished";`);
console.log("By isPublished:", pub);

await client.end();
