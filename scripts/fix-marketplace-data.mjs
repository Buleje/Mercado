import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    // 1. Delete fake seeded stores (all that start with seed_ in their id)
    const fakeSlugs = [
      'bodega-juanita', 'minimarket-los-angeles', 'fruteria-tropical',
      'carniceria-el-paisa', 'panaderia-san-martin', 'licoreria-party',
      'farmacia-salud-plus', 'bodega-don-pepe', 'restaurante-la-choza'
    ];
    
    const { rowCount: deleted } = await client.query(
      `DELETE FROM "Store" WHERE slug = ANY($1)`,
      [fakeSlugs]
    );
    console.log(`\n✅ Deleted ${deleted} fake stores`);

    // 2. Update the 'demo' store to have proper data
    await client.query(`
      UPDATE "Store" SET
        name = 'Bodega San Martín',
        description = 'Tu bodega de confianza en Pucallpa. Abarrotes, bebidas, carnes, frutas y productos de limpieza con delivery rápido.',
        category = 'bodega',
        zone = 'centro',
        rating = 4.8,
        "reviewCount" = 45,
        "isPublished" = true,
        "updatedAt" = NOW()
      WHERE slug = 'demo'
    `);
    console.log('✅ Updated demo store → "Bodega San Martín"');

    // 3. Get the demo store id
    const { rows: [demoStore] } = await client.query(`SELECT id FROM "Store" WHERE slug = 'demo'`);
    if (!demoStore) { console.log('❌ No demo store found'); return; }
    const storeId = demoStore.id;

    // 4. Delete existing StoreProducts for this store (fresh start)
    const { rowCount: spDeleted } = await client.query(
      `DELETE FROM "StoreProduct" WHERE "storeId" = $1`, [storeId]
    );
    console.log(`✅ Cleaned ${spDeleted} existing StoreProducts`);

    // 5. Get all active products (from tenant 'main')  
    const { rows: products } = await client.query(
      `SELECT id, name, price, category FROM "Product" WHERE active = true AND "tenantId" = 'main' ORDER BY id`
    );
    console.log(`\n📦 Found ${products.length} active products to link`);

    // 6. Link products to the demo store as StoreProducts
    let linked = 0;
    for (const prod of products) {
      const spId = `sp_demo_${prod.id}_${Date.now()}`;
      const retailPrice = prod.price;
      // Wholesale = 10% discount from retail
      const wholesalePrice = Math.round(retailPrice * 0.9 * 100) / 100;
      
      await client.query(
        `INSERT INTO "StoreProduct" (id, "storeId", "productId", "retailPrice", "wholesalePrice", "minOrderQty", "isActive")
         VALUES ($1, $2, $3, $4, $5, 1, true)`,
        [spId, storeId, prod.id, retailPrice, wholesalePrice]
      );
      linked++;
    }
    console.log(`✅ Linked ${linked} products to demo store`);

    // 7. Verify
    const { rows: verify } = await client.query(`SELECT COUNT(*) as total FROM "Store" WHERE "isPublished" = true`);
    console.log(`\n=== Final state ===`);
    console.log(`Published stores: ${verify[0].total}`);
    
    const { rows: spCount } = await client.query(
      `SELECT COUNT(*) as total FROM "StoreProduct" WHERE "storeId" = $1 AND "isActive" = true`, [storeId]
    );
    console.log(`Products in Bodega San Martín: ${spCount[0].total}`);
    
    // Show remaining stores
    const { rows: remaining } = await client.query(
      `SELECT slug, name, category, zone, "isPublished" FROM "Store" ORDER BY name`
    );
    console.log(`\nAll stores:`);
    remaining.forEach(s => console.log(`  ${s.slug} | ${s.name} | ${s.category} | ${s.zone} | pub=${s.isPublished}`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
