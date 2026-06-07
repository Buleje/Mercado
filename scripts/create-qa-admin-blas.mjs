// Crea/actualiza un QA admin para la tienda forestal BLAS (verificación visual).
// Uso: node -r dotenv/config scripts/create-qa-admin-blas.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const SLUG = "inversiones-agroforestales-blas-sociedad-anonima";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const client = new Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: t } = await client.query(`select id, slug, name from "Tenant" where slug=$1 limit 1`, [SLUG]);
    if (t.length === 0) throw new Error(`Tenant ${SLUG} no existe`);
    const target = t[0];
    const passwordHash = await bcrypt.hash(PASS, 10);
    const existing = await client.query(`select id from "AdminUser" where "tenantId"=$1 and username=$2 limit 1`, [target.id, USER]);
    if (existing.rows.length > 0) {
      await client.query(`update "AdminUser" set "passwordHash"=$1, active=true, role='admin' where id=$2`, [passwordHash, existing.rows[0].id]);
      console.log(`UPDATED ${USER} en ${target.slug}`);
    } else {
      const id = "qa-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      await client.query(
        `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt") values ($1,$2,$3,$4,'admin',$5,true,now(),now())`,
        [id, target.id, USER, passwordHash, "QA Admin"],
      );
      console.log(`CREATED ${USER} en ${target.slug} (id=${id})`);
    }
    console.log(`\nLOGIN → usuario: ${USER} · pass: ${PASS} · tienda: ${target.slug}\nURL: http://localhost:3000/t/${target.slug}/admin`);
  } finally { await client.end(); }
}
main().catch((e) => { console.error("ERR:", e.message ?? e); process.exit(1); });
