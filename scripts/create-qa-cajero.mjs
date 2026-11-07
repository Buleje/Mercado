// Crea un admin con rol "cajero" en el tenant main para probar permisos por doc.
// Uso: node -r dotenv/config scripts/create-qa-cajero.mjs dotenv_config_path=.env.local
import bcrypt from "bcryptjs";
import pg from "pg";

const USER = "qacajero";
const PASS = "Qa-cajero-1234";
const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const passwordHash = await bcrypt.hash(PASS, 10);
  const { rows: existing } = await client.query(
    `select id from "AdminUser" where "tenantId"=$1 and username=$2 limit 1`,
    ["main", USER],
  );
  if (existing.length) {
    await client.query(`update "AdminUser" set "passwordHash"=$1, active=true, role='cajero' where id=$2`, [passwordHash, existing[0].id]);
    console.log("UPDATED cajero", existing[0].id);
  } else {
    await client.query(
      `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt") values (gen_random_uuid(), $1, $2, $3, 'cajero', 'QA Cajero', true, now(), now())`,
      ["main", USER, passwordHash],
    );
    console.log("CREATED cajero");
  }
  await client.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
