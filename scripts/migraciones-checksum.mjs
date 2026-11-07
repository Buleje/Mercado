#!/usr/bin/env node
/**
 * migraciones-checksum.mjs — alinea el `checksum` de UNA migración aplicada con
 * su `migration.sql` actual, por el pooler de SESIÓN (:5432), en una transacción.
 *
 * Por qué (16-10): 26 migraciones aplicadas tenían el .sql cambiado después de
 * aplicarse (15 eran sólo los saltos de línea CRLF de Windows). `prisma migrate
 * dev` lo detecta y ofrece RESETEAR la base compartida (= producción). Sólo se
 * alinea lo que `migraciones-cruce.mjs --verificar <carpeta>` da OK, o sea:
 * cuando el archivo actual describe lo que de verdad hay en la base.
 *
 * Uso:
 *   node scripts/migraciones-checksum.mjs <carpeta>               # al sha256 del archivo actual
 *   node scripts/migraciones-checksum.mjs <carpeta> --ensayo      # todo igual, termina en ROLLBACK
 *   node scripts/migraciones-checksum.mjs <carpeta> --a <sha256>  # deshacer: vuelve al valor del respaldo CSV
 *
 * Garantías:
 *   · sin `--a`, corre antes `migraciones-cruce.mjs --verificar <carpeta>` y se
 *     niega si el veredicto no es OK;
 *   · toca UNA fila: `UPDATE … WHERE migration_name = $1 AND id = $3 AND
 *     checksum = $4` (la aplicada y no rolled_back, con el checksum que se leyó);
 *     si no cambia exactamente 1 fila, ROLLBACK;
 *   · `SET LOCAL lock_timeout` (de transacción). Nunca `SET SESSION`: el pooler
 *     lo pega en conexiones de producción (memoria `pooler-set-session-se-pega`);
 *   · relee la fila después del COMMIT e imprime viejo → nuevo.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "dotenv";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(repo, ".env.local"), quiet: true });
config({ path: resolve(repo, ".env"), quiet: true });

const args = process.argv.slice(2);
const ensayo = args.includes("--ensayo");
const iA = args.indexOf("--a");
const valorA = iA >= 0 ? args[iA + 1] : null;
const carpeta = args.find((a, i) => !a.startsWith("--") && (iA < 0 || i !== iA + 1));
if (!carpeta || (iA >= 0 && !/^[0-9a-f]{64}$/.test(valorA ?? ""))) {
  console.error("Uso: node scripts/migraciones-checksum.mjs <carpeta> [--ensayo] [--a <sha256 del respaldo>]");
  process.exit(2);
}
const archivo = resolve(repo, "prisma/migrations", carpeta, "migration.sql");
if (!existsSync(archivo)) {
  console.error(`[checksum] no existe ${archivo}`);
  process.exit(2);
}
const nuevo = valorA ?? createHash("sha256").update(readFileSync(archivo)).digest("hex");

if (!valorA) {
  const v = spawnSync("node", [resolve(repo, "scripts/migraciones-cruce.mjs"), "--json", "--verificar", carpeta], { encoding: "utf8", cwd: repo });
  let veredicto = null;
  let malas = [];
  try {
    const j = JSON.parse(v.stdout);
    veredicto = j.verificadas?.[0]?.veredicto ?? null;
    malas = (j.verificadas?.[0]?.chequeos ?? []).filter(([e]) => e !== "ok");
  } catch {
    console.error(`[checksum] no pude leer el --verificar: ${String(v.stderr).slice(0, 300)}`);
    process.exit(1);
  }
  if (veredicto !== "OK") {
    console.error(`[checksum] ${carpeta}: --verificar da ${veredicto}; no se toca.`);
    for (const [e, d] of malas) console.error(`   ${e} ${d}`);
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL) {
  console.error("[checksum] falta DATABASE_URL en .env.local");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
if (url.host.includes("pooler.supabase.com")) {
  url.port = "5432"; // session mode, igual que prisma-session.mjs
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("connection_limit");
}

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
let id = null;
let viejo = null;
try {
  await c.query("BEGIN");
  await c.query("SET LOCAL lock_timeout = '5s'");
  const { rows } = await c.query(
    `select id, checksum from _prisma_migrations where migration_name = $1 and finished_at is not null and rolled_back_at is null`,
    [carpeta],
  );
  if (rows.length !== 1) throw new Error(`esperaba 1 fila aplicada de ${carpeta}, hay ${rows.length}`);
  ({ id, checksum: viejo } = rows[0]);
  if (viejo === nuevo) {
    await c.query("ROLLBACK");
    console.log(`= ${carpeta}: ya estaba en ${nuevo.slice(0, 12)}…`);
    await c.end();
    process.exit(0);
  }
  const r = await c.query(
    `update _prisma_migrations set checksum = $2 where migration_name = $1 and id = $3 and checksum = $4`,
    [carpeta, nuevo, id, viejo],
  );
  if (r.rowCount !== 1) throw new Error(`el UPDATE tocó ${r.rowCount} filas, se revierte`);
  await c.query(ensayo ? "ROLLBACK" : "COMMIT");
} catch (err) {
  await c.query("ROLLBACK").catch((e) => console.error("[checksum] rollback", String(e)));
  console.error(`[checksum] ${carpeta}: ${String(err?.message ?? err)}`);
  await c.end();
  process.exit(1);
}
const { rows: [f] } = await c.query(
  `select migration_name, checksum, finished_at is not null as aplicada, rolled_back_at is null as viva from _prisma_migrations where id = $1`,
  [id],
);
await c.end();
const quedo = f.checksum === nuevo ? "nuevo" : f.checksum === viejo ? "viejo" : "OTRO";
console.log(
  `${ensayo ? "ENSAYO (ROLLBACK) " : ""}${carpeta}: ${viejo.slice(0, 12)}… → releída ${f.checksum.slice(0, 12)}… (= ${quedo}; aplicada=${f.aplicada}, viva=${f.viva})`,
);
if (!ensayo && quedo !== "nuevo") process.exit(1);
if (ensayo && quedo !== "viejo") {
  console.error("⚠️ EL ENSAYO NO REVIRTIÓ");
  process.exit(1);
}
