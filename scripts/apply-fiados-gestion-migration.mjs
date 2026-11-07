#!/usr/bin/env node
// Aplica prisma/migrations/adr-fiados-gestion.sql (tabla FiadoGestion).
// Ejecuta statement por statement con autocommit (igual patrón que
// apply-376-migration.mjs).
//
// Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;
const TAG = "fiados-gestion";

// Preferimos DIRECT_URL (IPv6, no pooler). Si WSL no tiene IPv6 routing,
// fallback a DATABASE_URL pero forzando puerto 5432 (session mode).
// USE_POOLER=1 fuerza el pooler (útil en WSL sin IPv6 routing).
const FORCE_POOLER = process.env.USE_POOLER === "1";
const RAW_URL = (FORCE_POOLER ? process.env.DATABASE_URL : process.env.DIRECT_URL)
  || process.env.DATABASE_URL
  || process.env.DIRECT_URL;
if (!RAW_URL) {
  console.error(`[${TAG}] DIRECT_URL or DATABASE_URL missing — aborting`);
  process.exit(1);
}
const url = new URL(RAW_URL);
const isPooler = url.hostname.includes("pooler.supabase.com");
if (isPooler && url.port === "6543") {
  console.log(`[${TAG}] forzando session mode (5432) en pooler`);
  url.port = "5432";
}

const SQL_FILE = process.env.SQL_FILE || "prisma/migrations/adr-fiados-gestion.sql";
const raw = readFileSync(SQL_FILE, "utf8");

// Split por ';' fuera de comentarios — simple porque el archivo es predecible.
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`[${TAG}] ${statements.length} statements detected. Connecting to Supabase…`);

// WSL2 resuelve hostname a IPv6 pero no tiene ruta IPv6.
// Resuelvo a IPv4 manualmente y paso la IP como host.
const originalHost = url.hostname;
let ipv4;
try {
  const r = await lookup(originalHost, { family: 4 });
  ipv4 = r.address;
  console.log(`[${TAG}] resolved ${originalHost} → ${ipv4} (IPv4)`);
} catch (e) {
  console.error(`[${TAG}] DNS IPv4 lookup failed for ${originalHost}: ${e?.message ?? e}`);
  console.error(`[${TAG}] tip: el direct URL de Supabase solo tiene AAAA (IPv6).`);
  console.error(`[${TAG}] usá USE_POOLER=1 (DATABASE_URL, IPv4).`);
  process.exit(1);
}

const client = new Client({
  host: ipv4,
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, "") || "postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  // SNI requiere hostname original para certificate validation
  ssl: { rejectUnauthorized: false, servername: originalHost },
  connectionTimeoutMillis: 15_000,
});

const t0 = Date.now();

try {
  await client.connect();
  console.log(`[${TAG}] connected in ${Date.now() - t0}ms`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, " ").slice(0, 90);
    try {
      const t = Date.now();
      await client.query(stmt);
      console.log(`  ✓ ${Date.now() - t}ms  ${preview}…`);
      ok++;
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (msg.includes("already exists")) {
        console.log(`  ↳ skip   already exists: ${preview}…`);
        skipped++;
      } else {
        console.error(`  ✗ FAIL   ${preview}…`);
        console.error(`     ${msg}`);
        failed++;
      }
    }
  }

  console.log(`\n[${TAG}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 2 : 0);
} catch (e) {
  console.error(`[${TAG}] connection error: ${e?.message ?? e}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
