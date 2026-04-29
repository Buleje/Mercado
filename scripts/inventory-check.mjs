// Quick check: tenants + productos por tenant.
import pg from "pg";
const { Client } = pg;
const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) throw new Error("No DATABASE_URL");
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: tenants } = await client.query(
  `SELECT id, slug, name FROM "Tenant" ORDER BY "createdAt" LIMIT 10`,
);
console.log("=== Tenants ===");
console.table(tenants);

const { rows: products } = await client.query(
  `SELECT "tenantId", COUNT(*)::int AS n FROM "Product" GROUP BY "tenantId" ORDER BY n DESC LIMIT 10`,
);
console.log("=== Productos por tenant ===");
console.table(products);

await client.end();
