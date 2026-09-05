// Crea/actualiza un usuario con rol `almacenero` en la tienda forestal BLAS.
//
// Existe para poder VERIFICAR los guards de rol, no para operar: hay acciones
// —anular corridas del Libro, borrar lotes— que sólo pueden hacer admin/owner, y
// sin un usuario de ese rol el 403 se razona pero no se ve rechazar.
//
// Uso: node -r dotenv/config scripts/create-qa-almacenero.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const SLUG = "inversiones-agroforestales-blas-sociedad-anonima";
const USER = "qaalmacenero";
const PASS = "Qa-almacen-1234";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows: t } = await client.query(`select id, slug from "Tenant" where slug=$1 limit 1`, [SLUG]);
    if (t.length === 0) throw new Error(`Tenant ${SLUG} no existe`);
    const target = t[0];
    const passwordHash = await bcrypt.hash(PASS, 10);
    const existing = await client.query(
      `select id from "AdminUser" where "tenantId"=$1 and username=$2 limit 1`,
      [target.id, USER],
    );
    if (existing.rows.length > 0) {
      await client.query(
        `update "AdminUser" set "passwordHash"=$1, active=true, role='almacenero' where id=$2`,
        [passwordHash, existing.rows[0].id],
      );
      console.log(`UPDATED ${USER} (almacenero) en ${target.slug}`);
    } else {
      const id = "qa-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      await client.query(
        `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt")
         values ($1,$2,$3,$4,'almacenero',$5,true,now(),now())`,
        [id, target.id, USER, passwordHash, "QA Almacenero"],
      );
      console.log(`CREATED ${USER} (almacenero) en ${target.slug}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
