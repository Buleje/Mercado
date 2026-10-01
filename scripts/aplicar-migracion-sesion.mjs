#!/usr/bin/env node
/**
 * Aplica UN archivo .sql de `prisma/migrations/` por el pooler de SESIÓN
 * (:5432), en UNA transacción. Después: `node scripts/prisma-session.mjs
 * migrate resolve --applied <carpeta>` (ver memoria migracion-pooler-y-resolve-quirurgico).
 *
 * Uso:
 *   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> dotenv_config_path=.env.local
 *
 * Por qué y no `apply-fiados-gestion-migration.mjs` ni `prisma db execute`:
 * · Atómico: todo o nada. El de fiados corre en autocommit (si falla a mitad
 *   deja media migración); `db execute` no deja re-correr un archivo con FK.
 * · FK idempotentes sin `DO $$`: cada sentencia va en su SAVEPOINT y
 *   «already exists» (Postgres no tiene ADD CONSTRAINT IF NOT EXISTS) se salta
 *   sin abortar la transacción. Cualquier otro error la revierte entera.
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
if (!archivo) {
  console.error("Uso: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> dotenv_config_path=.env.local");
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

const sentencias = readFileSync(archivo, "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await c.connect();
console.log(`[aplicar] ${archivo} · ${url.host} (session) · ${sentencias.length} sentencias`);
try {
  await c.query("BEGIN");
  await c.query("SET LOCAL lock_timeout = '5s'");
  let i = 0;
  for (const s of sentencias) {
    i += 1;
    const cabeza = s.replace(/\s+/g, " ").slice(0, 110);
    await c.query(`SAVEPOINT s${i}`);
    try {
      await c.query(s);
      await c.query(`RELEASE SAVEPOINT s${i}`);
      console.log(`  ✓ ${cabeza}`);
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT s${i}`);
      if (String(e.message).includes("already exists")) {
        console.log(`  · ya estaba: ${cabeza}`);
        continue;
      }
      throw e;
    }
  }
  await c.query("COMMIT");
  console.log("[aplicar] COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch((err) => console.error("[aplicar] ROLLBACK falló:", err.message));
  console.error("[aplicar] ROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
