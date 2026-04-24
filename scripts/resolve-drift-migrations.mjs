#!/usr/bin/env node
/**
 * Resuelve drift entre migrations locales y DB remota.
 *
 * Estrategia:
 *  1. Lista tablas actuales en schema public.
 *  2. Por cada migration pendiente, extrae los `CREATE TABLE "X"`.
 *  3. Si TODAS las tablas que la migration crea ya existen -> marcar --applied.
 *  4. Si alguna NO existe -> reportar para decision manual.
 *
 * No toca la DB salvo por:
 *  - SELECT information_schema.tables (lectura)
 *  - `prisma migrate resolve --applied <m>` (solo para las confirmadas)
 */

import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";
import "dotenv/config";

const PENDING = [
  "20260404220000_add_forecast_log",
  "20260404230000_add_credit_engine",
  "20260404240000_add_supplier_portal_models",
  "20260406210602_add_ai_conversation_and_message",
  "20260409230000_add_loyalty_transaction",
  "20260411_marketplace_abandoned_cart",
  "20260411000000_store_page_system",
  "20260418000000_add_subscription_bodega_al_mes",
  "20260418120000_add_gift_cards_hmac",
  "20260418152307_add_vendor_application_workflow",
  "20260418202046_add_socio_buleje_membership",
];

const MIG_DIR = "prisma/migrations";

function extractCreateTables(sql) {
  const regex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi;
  const out = new Set();
  for (const m of sql.matchAll(regex)) out.add(m[1]);
  return [...out];
}

function extractAddColumns(sql) {
  const regex = /ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi;
  const out = [];
  for (const m of sql.matchAll(regex)) out.push({ table: m[1], column: m[2] });
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL
    .replace(":6543", ":5432")
    .replace(/[?&]pgbouncer=true/g, "")
    .replace(/\?$/, "");

  // Supabase pooler uses a cert chain Node doesn't trust by default. Disable
  // strict verification (read-only introspection + migrate resolve only).
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows: tableRows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const existingTables = new Set(tableRows.map((r) => r.table_name));

  const { rows: colRows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const existingCols = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));

  console.log(`\nDB state: ${existingTables.size} tables, ${existingCols.size} columns\n`);

  const toMarkApplied = [];
  const toRun = [];

  for (const m of PENDING) {
    const f = `${MIG_DIR}/${m}/migration.sql`;
    const sql = readFileSync(f, "utf8");
    const tables = extractCreateTables(sql);
    const cols = extractAddColumns(sql);

    const missingTables = tables.filter((t) => !existingTables.has(t));
    const missingCols = cols.filter((c) => !existingCols.has(`${c.table}.${c.column}`));

    const status = missingTables.length === 0 && missingCols.length === 0 ? "APPLIED" : "MISSING";

    console.log(
      `[${status}] ${m}\n  tables created by migration: ${tables.length} (${missingTables.length} missing)\n  columns added: ${cols.length} (${missingCols.length} missing)`
    );

    if (missingTables.length > 0) {
      console.log(`   missing tables: ${missingTables.join(", ")}`);
    }
    if (missingCols.length > 0) {
      console.log(
        `   missing cols: ${missingCols.map((c) => `${c.table}.${c.column}`).slice(0, 5).join(", ")}${missingCols.length > 5 ? "..." : ""}`
      );
    }

    if (status === "APPLIED") toMarkApplied.push(m);
    else toRun.push(m);
  }

  await client.end();

  console.log(`\n================`);
  console.log(`TO MARK APPLIED: ${toMarkApplied.length}`);
  console.log(`TO RUN: ${toRun.length}`);
  console.log(`================\n`);

  if (toRun.length > 0) {
    console.log("The following migrations have missing structure and need to run:");
    toRun.forEach((m) => console.log(`  - ${m}`));
    console.log("\nReview each one manually before applying. Exiting without changes.");
    return;
  }

  console.log("All pending migrations are structurally already applied in DB.");
  console.log("Marking them as applied in _prisma_migrations table...\n");

  process.env.DATABASE_URL = url;
  for (const m of toMarkApplied) {
    console.log(`resolve --applied ${m}`);
    try {
      const o = execSync(`npx prisma migrate resolve --applied ${m}`, {
        encoding: "utf8",
        timeout: 30000,
      });
      console.log(`  ${o.trim().split("\n").pop()}`);
    } catch (e) {
      console.error(`  FAILED:`, e.stderr?.toString().slice(0, 200));
    }
  }

  console.log("\nFinal status:");
  const final = execSync("npx prisma migrate status", { encoding: "utf8", timeout: 30000 });
  console.log(final);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
