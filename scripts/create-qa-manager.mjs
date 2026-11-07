// Crea/actualiza un usuario con rol `manager` en el tenant de prueba.
//
// Existe para VERIFICAR el nivel «gestión» de Recursos Humanos (ADR-414): el
// manager ve personal, puestos, contratos y asistencia, pero no tarifas ni lo
// ganado. Sin un usuario de ese rol, el 403 de puestos (2026-09-14) se razonaba
// en el código pero no se veía desaparecer en el navegador.
//
// Uso: node -r dotenv/config scripts/create-qa-manager.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const SLUG = process.env.QA_TENANT_SLUG ?? "inversiones-agroforestales-blas-sociedad-op-qa-ui";
const USER = "qamanager";
const PASS = "Qa-manager-1234";

// Los usuarios QA viven SÓLO en tenants de prueba (misma guarda que
// `create-qa-almacenero.mjs`).
if (!/-qa(-|$)/.test(SLUG)) {
  console.error(`ABORTO: ${SLUG} no es un tenant de prueba (debe contener «-qa»)`);
  process.exit(1);
}

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
        `update "AdminUser" set "passwordHash"=$1, active=true, role='manager' where id=$2`,
        [passwordHash, existing.rows[0].id],
      );
      console.log(`UPDATED ${USER} (manager) en ${target.slug}`);
    } else {
      const id = "qa-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      await client.query(
        `insert into "AdminUser" (id, "tenantId", username, "passwordHash", role, name, active, "createdAt", "updatedAt")
         values ($1,$2,$3,$4,'manager',$5,true,now(),now())`,
        [id, target.id, USER, passwordHash, "QA Manager"],
      );
      console.log(`CREATED ${USER} (manager) en ${target.slug}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("ERR:", e.message ?? e);
  process.exit(1);
});
