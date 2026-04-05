import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    // All stores
    const { rows: stores } = await client.query(`SELECT id, slug, name, category, zone, "isPublished", "tenantId", rating, "reviewCount", "createdAt" FROM "Store" ORDER BY "createdAt"`);
    console.log(`\n=== ALL STORES (${stores.length}) ===`);
    stores.forEach(s => console.log(`  ${s.slug} | ${s.name} | pub=${s.isPublished} | tenant=${s.tenantId} | created=${s.createdAt}`));

    // All tenants
    const { rows: tenants } = await client.query(`SELECT id, slug, name, plan, type, active FROM "Tenant" ORDER BY "createdAt"`);
    console.log(`\n=== ALL TENANTS (${tenants.length}) ===`);
    tenants.forEach(t => console.log(`  ${t.slug} | ${t.name} | plan=${t.plan} | type=${t.type} | active=${t.active}`));

    // Products per store
    const { rows: sp } = await client.query(`SELECT s.slug, COUNT(sp.id) as products FROM "Store" s LEFT JOIN "StoreProduct" sp ON s.id = sp."storeId" GROUP BY s.slug ORDER BY s.slug`);
    console.log(`\n=== PRODUCTS PER STORE ===`);
    sp.forEach(r => console.log(`  ${r.slug}: ${r.products} products`));

    // Total products available
    const { rows: prodCount } = await client.query(`SELECT COUNT(*) as total FROM "Product" WHERE "isActive" = true`);
    console.log(`\n=== Total active products: ${prodCount[0].total} ===`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
