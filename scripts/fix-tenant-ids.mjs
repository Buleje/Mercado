// Script to migrate tenantId from CUID to slug in all tenant-scoped tables
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Get all tenants
  const { rows: tenants } = await pool.query('SELECT id, slug FROM "Tenant"');
  console.log(`Found ${tenants.length} tenants`);

  for (const t of tenants) {
    if (t.id === t.slug) continue; // main uses "main" for both

    console.log(`\nFixing ${t.slug} (id=${t.id})...`);

    // Fix AdminUser
    const au = await pool.query('UPDATE "AdminUser" SET "tenantId" = $1 WHERE "tenantId" = $2', [t.slug, t.id]);
    if (au.rowCount > 0) console.log(`  AdminUser: ${au.rowCount} rows`);

    // Fix Settings
    const se = await pool.query('UPDATE "Settings" SET "tenantId" = $1 WHERE "tenantId" = $2', [t.slug, t.id]);
    if (se.rowCount > 0) console.log(`  Settings: ${se.rowCount} rows`);

    // Note: Store, SupplierPortal, DeliveryPartner have FK to Tenant.id (CUID)
    // so they must keep the CUID, not the slug. Only non-FK fields need migration.
  }

  // Verify
  const { rows: admins } = await pool.query('SELECT username, "tenantId" FROM "AdminUser" ORDER BY "tenantId"');
  console.log('\n=== AdminUsers after fix ===');
  admins.forEach(a => console.log(`  ${a.tenantId}: @${a.username}`));

  await pool.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
