// Crea admin QA para tenant que contiene la tienda "mi-pollo".
// Uso: node -r dotenv/config scripts/create-mi-pollo-admin.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const USER = "qaadmin";
const PASS = "Qa-admin-1234";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("No DATABASE_URL");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Find Mi Pollo store
  const { rows: stores } = await client.query(
    `select s.id, s.slug, s.name, s."tenantId", t.slug as tenant_slug, t.name as tenant_name
     from "Store" s
     left join "Tenant" t on t.id = s."tenantId"
     where s.slug = 'mi-pollo'
     limit 1`,
  );

  if (stores.length === 0) {
    console.error("❌ Mi Pollo store NOT found in DB");
    process.exit(1);
  }

  const store = stores[0];
  console.log(`📍 Store: ${store.name} (slug=${store.slug})`);
  console.log(`📍 Tenant: ${store.tenant_name} (slug=${store.tenant_slug}, id=${store.tenantId})`);
  console.log();

  // Check existing admins
  const { rows: existing } = await client.query(
    `select id, username, role, active from "AdminUser" where "tenantId"=$1 order by "createdAt" desc`,
    [store.tenantId],
  );
  console.log(`Existing admins for tenant: ${existing.length}`);
  existing.forEach((a) => console.log(`  - ${a.username} (${a.role}) active=${a.active}`));
  console.log();

  // Upsert qaadmin
  const passwordHash = await bcrypt.hash(PASS, 10);
  const found = existing.find((a) => a.username === USER);

  if (found) {
    await client.query(
      `update "AdminUser" set "passwordHash"=$1, active=true, role='admin' where id=$2`,
      [passwordHash, found.id],
    );
    console.log(`✅ UPDATED admin ${USER} in tenant ${store.tenant_slug}`);
  } else {
    const id = "qa-mp-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await client.query(
      `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'admin', $5, true, now(), now())`,
      [id, store.tenantId, USER, passwordHash, "QA Admin Mi Pollo"],
    );
    console.log(`✅ CREATED admin ${USER} in tenant ${store.tenant_slug} (id=${id})`);
  }

  console.log(`
=====================
LOGIN — MI POLLO
=====================
  username:    ${USER}
  password:    ${PASS}
  tenant slug: ${store.tenant_slug}
  storefront:  http://localhost:3000/marketplace/${store.slug}
  admin URL:   http://localhost:3000/t/${store.tenant_slug}/admin/login
  o (header):  http://localhost:3000/admin/login (con x-tenant-id: ${store.tenant_slug})
=====================
`);

  await client.end();
}

main().catch((e) => {
  console.error("ERR:", e.message ?? e);
  process.exit(1);
});
