import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: count } = await client.query(`SELECT COUNT(*) as total FROM "Product" WHERE active = true`);
    console.log(`Active products: ${count[0].total}`);

    const { rows: cats } = await client.query(`SELECT category, COUNT(*) as c FROM "Product" WHERE active = true GROUP BY category ORDER BY c DESC`);
    console.log(`\nCategories:`);
    cats.forEach(c => console.log(`  ${c.category}: ${c.c} products`));

    const { rows: sample } = await client.query(`SELECT id, name, category, price, "tenantId" FROM "Product" WHERE active = true ORDER BY id LIMIT 15`);
    console.log(`\nSample products:`);
    sample.forEach(p => console.log(`  #${p.id} | ${p.name} | ${p.category} | S/${p.price} | tenant=${p.tenantId}`));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
