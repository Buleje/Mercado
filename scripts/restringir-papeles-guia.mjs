#!/usr/bin/env node
/**
 * Papeles de guía ya subidos sin roles → los roles de la ruta (ADR-482,
 * revisión de seguridad 08-10).
 *
 * Desde el 08-10 cada papel nuevo nace con `allowedRoles = admin, almacenero,
 * owner` (`ROLES_PAPELES_GUIA`). Los de antes heredaron los roles vacíos de
 * «Guías forestales (GTF)» y el cajero los veía en el Drive general. Esto les
 * pone los mismos roles a los que tienen etiqueta `casillero:` + `gtf:` y no
 * tienen roles propios. Idempotente: un papel con roles no se toca.
 *
 * Uso:
 *   node scripts/restringir-papeles-guia.mjs                       (cuenta, todos los negocios)
 *   node scripts/restringir-papeles-guia.mjs --aplicar --tenant <id>
 *
 * `--aplicar` exige `--tenant`: se corre negocio por negocio, a propósito.
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/* Copia de `ROLES_PAPELES_GUIA` (lib/forestal/documentos-guia.ts): un .mjs no importa TS. */
const ROLES = ["admin", "almacenero", "owner"];

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iT = args.indexOf("--tenant");
const tenant = iT >= 0 ? args[iT + 1] : null;
if (aplicar && !tenant) {
  console.error("--aplicar necesita --tenant <id>");
  process.exit(2);
}

const DONDE = `d."deletedAt" is null
  and cardinality(d."allowedRoles") = 0
  and exists (select 1 from unnest(d.tags) t where t like 'casillero:%')
  and exists (select 1 from unnest(d.tags) t where t like 'gtf:%')`;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  if (!aplicar) {
    await c.query("BEGIN READ ONLY");
    const r = await c.query(
      `select d."tenantId", count(*)::int as papeles_sin_roles from "Document" d
        where ${DONDE} ${tenant ? `and d."tenantId" = $1` : ""} group by 1 order by 2 desc`,
      tenant ? [tenant] : [],
    );
    await c.query("ROLLBACK");
    console.table(r.rows);
    console.log("Sólo conté. Para aplicar: --aplicar --tenant <id>");
  } else {
    await c.query("BEGIN");
    const r = await c.query(
      `update "Document" d set "allowedRoles" = $2::text[] where d."tenantId" = $1 and ${DONDE} returning d.id, d.name`,
      [tenant, ROLES],
    );
    await c.query("COMMIT");
    console.log(`${r.rowCount} papeles restringidos a ${ROLES.join(", ")} en ${tenant}`);
    for (const f of r.rows) console.log(" ·", f.name);
  }
} catch (e) {
  await c.query("ROLLBACK").catch((err) => console.error("[restringir] rollback", String(err)));
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
} finally {
  await c.end();
}
