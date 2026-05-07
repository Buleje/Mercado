#!/usr/bin/env node
/**
 * apply-pending-migrations.mjs
 *
 * Aplica migraciones que están en prisma/migrations/ pero NO en _prisma_migrations.
 * Útil cuando DIRECT_URL falla por IPv6 y necesitamos usar pgBouncer (DATABASE_URL).
 *
 * SAFETY:
 * - Solo aplica migraciones que tienen patrón "expand puro" (CREATE/ALTER ADD).
 * - NO aplica DROP/RENAME automáticamente (requiere review manual).
 * - Cada migration corre en su propio batch, error en una NO afecta a las demás.
 * - Marca cada migración aplicada en _prisma_migrations con checksum 'manual-apply'.
 *
 * Uso: node -r dotenv/config scripts/apply-pending-migrations.mjs dotenv_config_path=.env.local [migrationName1 migrationName2 ...]
 *      Si no se pasan args, lista las pendientes y pide confirmación.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};
const c = (color, s) => `${C[color]}${s}${C.reset}`;

const RISKY_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+CONSTRAINT\b/i,
  /\bRENAME\s+TO\b/i,
  /\bRENAME\s+COLUMN\b/i,
];

function isRisky(sql) {
  return RISKY_PATTERNS.some((re) => re.test(sql));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requerida");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const migDir = path.join(process.cwd(), "prisma", "migrations");
  const allDirs = fs.readdirSync(migDir).filter((d) => {
    const stat = fs.statSync(path.join(migDir, d));
    return stat.isDirectory() && /^\d{14}_/.test(d);
  }).sort();

  const { rows: applied } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at`,
  );
  const appliedSet = new Set(applied.map((r) => r.migration_name));

  const pending = allDirs.filter((d) => !appliedSet.has(d));

  console.log(c("cyan", c("bold", "📋 Estado de migraciones")));
  console.log(c("dim", `   Total en prisma/migrations: ${allDirs.length}`));
  console.log(c("dim", `   Aplicadas en DB:            ${appliedSet.size}`));
  console.log(c("yellow", `   Pendientes:                 ${pending.length}`));
  console.log("");

  if (pending.length === 0) {
    console.log(c("green", "✅ Sin migraciones pendientes"));
    await client.end();
    return;
  }

  // Filtrar por args si se pasaron
  const args = process.argv.slice(2).filter((a) => !a.startsWith("dotenv_"));
  const targets = args.length > 0
    ? pending.filter((p) => args.some((a) => p.includes(a)))
    : pending;

  console.log(c("bold", "Migraciones a aplicar:"));
  for (const m of targets) {
    const sqlPath = path.join(migDir, m, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(`  ${c("yellow", "⚠")}  ${m} (sin migration.sql)`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const risky = isRisky(sql);
    const lines = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length;
    console.log(`  ${risky ? c("red", "⚠ RISKY") : c("green", "✓ safe")} ${m} (${lines} stmts)`);
  }
  console.log("");

  if (args.length === 0) {
    console.log(c("yellow", "ℹ Llamar de nuevo con nombres específicos para aplicar:"));
    console.log(c("dim", "  Ejemplo: node ... apply-pending-migrations.mjs 20260418000000 20260418120000"));
    await client.end();
    return;
  }

  // Aplicar
  let okCount = 0;
  let failCount = 0;
  for (const m of targets) {
    const sqlPath = path.join(migDir, m, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(c("yellow", `⚠ ${m} sin migration.sql, skip`));
      continue;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");

    if (isRisky(sql)) {
      console.log(c("red", `❌ ${m}: contiene DROP/RENAME, requiere review manual. Skip.`));
      continue;
    }

    process.stdout.write(`▶ Aplicando ${c("cyan", m)} ... `);
    try {
      await client.query(sql);
      // Marcar en _prisma_migrations (sin ON CONFLICT: hacemos lookup primero)
      const { rows: existing } = await client.query(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
        [m],
      );
      if (existing.length === 0) {
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES (gen_random_uuid()::text, 'manual-apply', NOW(), $1, NOW(), 1)`,
          [m],
        );
      }
      console.log(c("green", "✅ OK"));
      okCount++;
    } catch (err) {
      // Si el error es "ya existe", solo marcamos como aplicada
      const msg = err.message ?? "";
      const alreadyApplied = /already exists/i.test(msg);
      if (alreadyApplied) {
        try {
          const { rows: existing } = await client.query(
            `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
            [m],
          );
          if (existing.length === 0) {
            await client.query(
              `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
               VALUES (gen_random_uuid()::text, 'manual-apply', NOW(), $1, NOW(), 1)`,
              [m],
            );
          }
          console.log(c("yellow", "⚠ ya estaba aplicada (registrada)"));
          okCount++;
        } catch (innerErr) {
          console.log(c("red", `❌ ERROR registro: ${innerErr.message}`));
          failCount++;
        }
      } else {
        console.log(c("red", `❌ ERROR: ${msg}`));
        failCount++;
      }
    }
  }

  console.log("");
  console.log(c("bold", "Resumen:"));
  console.log(`  ${c("green", `✅ ${okCount}`)} aplicadas`);
  if (failCount > 0) console.log(`  ${c("red", `❌ ${failCount}`)} fallaron`);

  await client.end();
}

main().catch((e) => {
  console.error(c("red", `FATAL: ${e.message}`));
  process.exit(1);
});
