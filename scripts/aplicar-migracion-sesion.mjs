#!/usr/bin/env node
/**
 * Aplica UN archivo .sql de `prisma/migrations/` por el pooler de SESIÓN
 * (:5432), en UNA transacción. Después: `node scripts/prisma-session.mjs
 * migrate resolve --applied <carpeta>` (ver memoria migracion-pooler-y-resolve-quirurgico).
 *
 * Uso:
 *   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> [--ensayo] dotenv_config_path=.env.local
 *
 * `--ensayo` (08-10, K2): corre todo igual y termina en ROLLBACK. Antes de
 * revertir verifica DENTRO de la transacción que existan las tablas
 * (`CREATE TABLE IF NOT EXISTS "X"`), columnas (`ALTER TABLE "X" ADD COLUMN IF
 * NOT EXISTS "c"`) e índices (`CREATE [UNIQUE] INDEX IF NOT EXISTS "i"`) que
 * declara el archivo. Así el ensayo en seco ya no pide un script temporal.
 *
 * Por qué y no `apply-fiados-gestion-migration.mjs` ni `prisma db execute`:
 * · Atómico: todo o nada. El de fiados corre en autocommit (si falla a mitad
 *   deja media migración); `db execute` no deja re-correr un archivo con FK.
 * · FK idempotentes sin `DO $$`: cada sentencia va en su SAVEPOINT y
 *   «already exists» (Postgres no tiene ADD CONSTRAINT IF NOT EXISTS) se salta
 *   sin abortar la transacción. Cualquier otro error la revierte entera.
 * · `IF NOT EXISTS` no da error sino un NOTICE «already exists, skipping»: se
 *   escucha y la sentencia se cuenta como «ya estaba». La 2.ª corrida de una
 *   migración idempotente tiene que cerrar con «0 nuevas».
 * · `SET LOCAL lock_timeout = '5s'`: si una tabla de producción está tomada,
 *   se aborta en vez de encolar escrituras detrás del ALTER. LOCAL vive sólo
 *   en esta transacción — nunca SET SESSION (el pooler lo pegaría en
 *   conexiones de producción, memoria pooler-set-session-se-pega).
 * · Parte por `;` de sentencia tras sacar las líneas `--` (memoria
 *   migracion-sql-script-parte-por-punto-y-coma): nada de `;` dentro de
 *   literales ni comentarios al final de una línea de SQL.
 *
 * Usado por primera vez en 20260927_lote_mixto_adr441 (ADR-441).
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const archivo = process.argv.slice(2).find((a) => a.endsWith(".sql"));
const ensayo = process.argv.includes("--ensayo");
if (!archivo) {
  console.error("Uso: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> [--ensayo] dotenv_config_path=.env.local");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("[aplicar] falta DATABASE_URL (¿dotenv_config_path=.env.local?)");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
if (!url.host.includes("pooler.supabase.com")) {
  console.error(`[aplicar] DATABASE_URL no apunta al pooler de Supabase (${url.host})`);
  process.exit(1);
}
url.port = "5432";
url.searchParams.delete("pgbouncer");
url.searchParams.delete("connection_limit");

const sinComentarios = readFileSync(archivo, "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const sentencias = sinComentarios
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

/** Lo que el archivo dice crear: se verifica en el ensayo antes del ROLLBACK. */
function declarado(sql) {
  const tablas = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/gi)].map((m) => m[1]);
  const columnas = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/gi)].map((m) => [m[1], m[2]]);
  const indices = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/gi)].map((m) => m[1]);
  return { tablas, columnas, indices };
}

async function verificar(c) {
  const { tablas, columnas, indices } = declarado(sinComentarios);
  let faltan = 0;
  for (const t of tablas) {
    const r = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [t],
    );
    if (r.rows[0].n === 0) faltan += 1;
    console.log(`  ${r.rows[0].n ? "✓" : "✗"} tabla ${t}: ${r.rows[0].n} columnas`);
  }
  for (const [t, col] of columnas) {
    const r = await c.query(
      "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
      [t, col],
    );
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} columna ${t}.${col}: ${r.rows[0]?.data_type ?? "NO EXISTE"}`);
  }
  for (const i of indices) {
    const r = await c.query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1", [i]);
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} índice ${i}`);
  }
  return faltan;
}

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
const avisos = [];
c.on("notice", (n) => avisos.push(String(n.message)));
await c.connect();
console.log(`[aplicar] ${archivo} · ${url.host} (session) · ${sentencias.length} sentencias${ensayo ? " · ENSAYO (termina en ROLLBACK)" : ""}`);
let nuevas = 0;
let yaEstaban = 0;
try {
  await c.query("BEGIN");
  await c.query("SET LOCAL lock_timeout = '5s'");
  let i = 0;
  for (const s of sentencias) {
    i += 1;
    const cabeza = s.replace(/\s+/g, " ").slice(0, 110);
    await c.query(`SAVEPOINT s${i}`);
    avisos.length = 0;
    try {
      await c.query(s);
      await c.query(`RELEASE SAVEPOINT s${i}`);
      // «does not exist, skipping» = un DROP … IF EXISTS que ya se había hecho
      // (K7: se suelta el CHECK viejo y se pone una v2 con otro nombre).
      if (avisos.some((m) => m.includes("already exists, skipping") || m.includes("does not exist, skipping"))) {
        yaEstaban += 1;
        console.log(`  · ya estaba: ${cabeza}`);
      } else {
        nuevas += 1;
        console.log(`  ✓ ${cabeza}`);
      }
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT s${i}`);
      if (String(e.message).includes("already exists")) {
        yaEstaban += 1;
        console.log(`  · ya estaba: ${cabeza}`);
        continue;
      }
      throw e;
    }
  }
  console.log(`[aplicar] ${nuevas} nuevas · ${yaEstaban} ya estaban`);
  if (ensayo) {
    const faltan = await verificar(c);
    await c.query("ROLLBACK");
    console.log(`[aplicar] ENSAYO → ROLLBACK (no quedó nada escrito) · ${faltan ? `${faltan} FALTAN` : "todo lo declarado existía dentro de la tx"}`);
    if (faltan) process.exitCode = 1;
  } else {
    await c.query("COMMIT");
    console.log("[aplicar] COMMIT");
  }
} catch (e) {
  await c.query("ROLLBACK").catch((err) => console.error("[aplicar] ROLLBACK falló:", err.message));
  console.error("[aplicar] ROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
