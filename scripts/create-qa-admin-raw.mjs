// Crea admin QA vía SQL raw (evita Prisma schema drift).
// Uso: node -r dotenv/config scripts/create-qa-admin-raw.mjs dotenv_config_path=.env.local
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

  // List tenants
  const { rows: tenants } = await client.query(
    `select id, slug, name from "Tenant" order by "createdAt" asc limit 20`
  );
  console.log("TENANTS:", tenants);

  if (tenants.length === 0) throw new Error("No tenants");

  // Target: main if exists, else first
  const target = tenants.find((t) => t.slug === "main") ?? tenants[0];
  console.log("Target tenant:", target);

  // Discover AdminUser columns to be drift-safe
  const { rows: cols } = await client.query(
    `select column_name, is_nullable, data_type from information_schema.columns where table_name='AdminUser' order by ordinal_position`
  );
  console.log("AdminUser columns:", cols.map((c) => c.column_name));

  const passwordHash = await bcrypt.hash(PASS, 10);

  // Upsert by (tenantId, username)
  const existing = await client.query(
    `select id from "AdminUser" where "tenantId"=$1 and username=$2 limit 1`,
    [target.id, USER]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `update "AdminUser" set "passwordHash"=$1, active=true, role='admin' where id=$2`,
      [passwordHash, existing.rows[0].id]
    );
    console.log(`UPDATED admin ${USER} in tenant ${target.slug}`);
  } else {
    // Use nanoid-like cuid
    const id = "qa-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await client.query(
      `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt") values ($1, $2, $3, $4, 'admin', $5, true, now(), now())`,
      [id, target.id, USER, passwordHash, "QA Admin"]
    );
    console.log(`CREATED admin ${USER} in tenant ${target.slug} with id=${id}`);
  }

  console.log(`
=====================
LOGIN CREDENTIALS
=====================
  username: ${USER}
  password: ${PASS}
  tenant slug: ${target.slug}
  login URL: http://localhost:3000/t/${target.slug}/admin
=====================
`);

  await client.end();
}

main().catch((e) => {
  console.error("ERR:", e.message ?? e);
  process.exit(1);
});
