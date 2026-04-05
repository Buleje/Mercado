import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const tenants = await pool.query('SELECT id, slug, name FROM "Tenant"');
  console.log("=== TENANTS ===");
  console.log(JSON.stringify(tenants.rows, null, 2));

  const admins = await pool.query('SELECT id, username, "tenantId", role FROM "AdminUser"');
  console.log("\n=== ADMIN USERS ===");
  console.log(JSON.stringify(admins.rows, null, 2));

  const productCounts = await pool.query('SELECT "tenantId", COUNT(*)::int as count FROM "Product" GROUP BY "tenantId"');
  console.log("\n=== PRODUCTS BY TENANT ===");
  console.log(JSON.stringify(productCounts.rows, null, 2));

  const settings = await pool.query('SELECT id, "tenantId", "businessName" FROM "Settings"');
  console.log("\n=== SETTINGS ===");
  console.log(JSON.stringify(settings.rows, null, 2));

  const stores = await pool.query('SELECT id, "tenantId", slug, name FROM "Store"');
  console.log("\n=== MARKETPLACE STORES ===");
  console.log(JSON.stringify(stores.rows, null, 2));

  const orderCounts = await pool.query('SELECT "tenantId", COUNT(*)::int as count FROM "Order" GROUP BY "tenantId"');
  console.log("\n=== ORDERS BY TENANT ===");
  console.log(JSON.stringify(orderCounts.rows, null, 2));
} finally {
  await pool.end();
}
