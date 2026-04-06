import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  // Step 1: Get all tenants with their ID and slug
  const { rows: tenants } = await pool.query('SELECT id, slug, name FROM "Tenant"');
  console.log("=== TENANTS ===");
  console.log(JSON.stringify(tenants, null, 2));

  // Build mapping: slug → CUID for tenants where slug !== id
  const slugToId = {};
  for (const t of tenants) {
    if (t.slug !== t.id) {
      slugToId[t.slug] = t.id;
      console.log(`\nWill normalize: slug "${t.slug}" → id "${t.id}" (${t.name})`);
    }
  }

  if (Object.keys(slugToId).length === 0) {
    console.log("\nNo normalization needed — all tenantIds match their tenant.id");
    await pool.end();
    process.exit(0);
  }

  // Step 2: Tables that have a tenantId column
  const tables = [
    "Product", "Order", "Customer", "Settings", "Supplier", "Sale",
    "Coupon", "Promotion", "Return", "Expense", "InventoryMovement",
    "PurchaseOrder", "AdminUser", "PushSubscription", "Review",
    "CashRegister", "SavedCart", "ActivityLog", "NotificationLog",
    "ChatMessage", "AdminMessage", "AbTest", "SurveyResponse",
    "Page", "Media", "DeliverySlot", "ShoppingList", "Bundle",
    "Payable", "Store"
  ];

  // Step 3: For each slug that needs normalization, update all tables
  for (const [slug, cuid] of Object.entries(slugToId)) {
    console.log(`\n--- Normalizing slug "${slug}" → CUID "${cuid}" ---`);
    for (const table of tables) {
      try {
        const result = await pool.query(
          `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" = $2`,
          [cuid, slug]
        );
        if (result.rowCount > 0) {
          console.log(`  ✅ ${table}: ${result.rowCount} rows updated`);
        }
      } catch (e) {
        // Table might not have tenantId column or column might not exist — skip
        if (!e.message.includes('does not exist')) {
          console.log(`  ⚠️  ${table}: ${e.message}`);
        }
      }
    }
  }

  // Step 4: Handle duplicate Settings (same tenant may have settings under both slug and CUID)
  for (const [slug, cuid] of Object.entries(slugToId)) {
    const { rows: dupes } = await pool.query(
      `SELECT id, "tenantId", "businessName" FROM "Settings" WHERE "tenantId" = $1`,
      [cuid]
    );
    if (dupes.length > 1) {
      // Keep the one with more data (non-null businessName), delete others
      const sorted = dupes.sort((a, b) => (b.businessName ? 1 : 0) - (a.businessName ? 1 : 0));
      for (let i = 1; i < sorted.length; i++) {
        console.log(`  🗑️  Removing duplicate Settings id=${sorted[i].id} for tenant "${cuid}" (businessName: "${sorted[i].businessName}")`);
        await pool.query('DELETE FROM "Settings" WHERE id = $1', [sorted[i].id]);
      }
    }
  }

  // Verify
  console.log("\n=== VERIFICATION ===");
  const { rows: adminUsers } = await pool.query('SELECT username, "tenantId", role FROM "AdminUser"');
  console.log("AdminUsers:", JSON.stringify(adminUsers, null, 2));
  const { rows: productCounts } = await pool.query('SELECT "tenantId", COUNT(*)::int as count FROM "Product" GROUP BY "tenantId"');
  console.log("Products by tenant:", JSON.stringify(productCounts, null, 2));
  const { rows: settings } = await pool.query('SELECT id, "tenantId", "businessName" FROM "Settings"');
  console.log("Settings:", JSON.stringify(settings, null, 2));
} finally {
  await pool.end();
}
