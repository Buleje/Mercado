import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
  SELECT s.id, s.slug, s.name, s."isPublished", s."tenantId", s."createdAt",
         t.name AS tenant_name
  FROM "Store" s
  LEFT JOIN "Tenant" t ON t.id = s."tenantId"
  ORDER BY s."createdAt";
`);

console.log("\n=== All stores ===");
rows.forEach((r) => {
  console.log(
    `  [${r.isPublished ? "✓" : " "}] ${r.slug.padEnd(12)} ${r.name.padEnd(20)} (tenant: ${r.tenant_name})`,
  );
});

const unpublished = rows.filter((r) => !r.isPublished);
if (unpublished.length > 0) {
  console.log(`\nPublishing ${unpublished.length} unpublished store(s)...`);
  for (const s of unpublished) {
    await client.query(`UPDATE "Store" SET "isPublished" = true WHERE id = $1;`, [s.id]);
    console.log(`  ✓ Published: ${s.slug} (${s.name})`);
  }
}

const after = await client.query(`SELECT slug, name, "isPublished" FROM "Store" ORDER BY "createdAt";`);
console.log("\n=== Final state ===");
after.rows.forEach((r) => {
  console.log(`  [${r.isPublished ? "✓" : " "}] ${r.slug.padEnd(12)} ${r.name}`);
});

await client.end();
