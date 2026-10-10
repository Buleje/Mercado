#!/usr/bin/env node
/**
 * sql-lectura.mjs — UN SELECT contra la base, en una llamada y sin escribir.
 *
 * Por qué (05-10): para medir «¿dónde están los D1/D2 de Blas?» se escribió y
 * borró seis veces el mismo script temporal (`pg` sólo resuelve desde el repo,
 * así que no sirve el scratchpad). Medir antes de opinar es la regla; que
 * medir cueste un archivo nuevo cada vez es lo que hace que se salte.
 *
 * Uso:
 *   node scripts/sql-lectura.mjs "select count(*) from \"WoodEntryTroza\" where \"tenantId\"=$1" <tenantId>
 *   node scripts/sql-lectura.mjs --max 200 "select ..." [params...]
 *
 * Garantías:
 *   · sólo `select` / `with` (lo demás se rechaza antes de conectar) y una sola
 *     sentencia (sin `;` en medio);
 *   · corre dentro de `BEGIN READ ONLY … ROLLBACK`: aunque un `with` escondiera
 *     un update, Postgres lo rechaza. Es de TRANSACCIÓN, no de sesión — nunca
 *     `SET SESSION` sobre el DATABASE_URL: el pooler lo pega en conexiones de
 *     producción (memoria `pooler-set-session-se-pega`);
 *   · parámetros siempre como `$1 $2` (regla 11), nunca interpolados.
 * Sale una tabla (`console.table`) o, con `--json`, el JSON de las filas.
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const args = process.argv.slice(2);
const json = args.includes("--json");
const iMax = args.indexOf("--max");
const max = iMax >= 0 ? Number(args[iMax + 1]) : 50;
const resto = args.filter((a, i) => a !== "--json" && (iMax < 0 || (i !== iMax && i !== iMax + 1)));
const [sql, ...params] = resto;

if (!sql) {
  console.error('Uso: node scripts/sql-lectura.mjs [--json] [--max N] "select ... $1" [params...]');
  process.exit(2);
}
const limpio = sql.trim().replace(/;\s*$/, "");
if (!/^(select|with)\b/i.test(limpio) || limpio.includes(";")) {
  console.error("Sólo una sentencia select/with (sin ';' en medio).");
  process.exit(2);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(limpio, params);
  const filas = r.rows.slice(0, max);
  if (json) console.log(JSON.stringify(filas, null, 1));
  else console.table(filas);
  if (r.rows.length > max) console.log(`… ${r.rows.length - max} filas más (--max para ver más)`);
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
} finally {
  await c.query("ROLLBACK").catch((err) => console.error("[sql-lectura] rollback", String(err)));
  await c.end();
}
