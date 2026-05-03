// Debug login mi-pollo: verifica el estado real del admin en DB.
import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;
const PASS = "Qa-admin-1234";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("=== Tenant mi-pollo ===");
  const { rows: tenants } = await client.query(
    `select id, slug, name, active from "Tenant" where slug = 'mi-pollo' or id = 'cmoevpwfk0000l4vzwq6revm5'`,
  );
  console.log(JSON.stringify(tenants, null, 2));

  if (tenants.length === 0) {
    console.error("❌ Tenant mi-pollo NO existe");
    process.exit(1);
  }
  const tid = tenants[0].id;

  console.log("\n=== Admins en mi-pollo ===");
  const { rows: admins } = await client.query(
    `select id, username, role, active, "passwordHash" from "AdminUser" where "tenantId"=$1`,
    [tid],
  );
  for (const a of admins) {
    const ok = await bcrypt.compare(PASS, a.passwordHash);
    console.log(`  ${a.username} (${a.role}) active=${a.active} hash_len=${a.passwordHash.length} pass_match='${PASS}'=${ok}`);
  }

  console.log("\n=== Reset hash de qaadmin con Qa-admin-1234 ===");
  const newHash = await bcrypt.hash(PASS, 10);
  const result = await client.query(
    `update "AdminUser" set "passwordHash"=$1, active=true, role='admin' where "tenantId"=$2 and username='qaadmin' returning id`,
    [newHash, tid],
  );
  console.log(`  Updated rows: ${result.rowCount}`);

  // Verify
  const { rows: verify } = await client.query(
    `select id, username, active, "passwordHash" from "AdminUser" where "tenantId"=$1 and username='qaadmin'`,
    [tid],
  );
  if (verify.length > 0) {
    const ok = await bcrypt.compare(PASS, verify[0].passwordHash);
    console.log(`  Post-update verify: ${ok ? "✅ Password OK" : "❌ Password mismatch"}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error("ERR:", e.message ?? e);
  process.exit(1);
});
