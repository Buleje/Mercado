#!/usr/bin/env node
// Aplica prisma/migrations/proposed-db-indexes-wave-1.sql usando DIRECT_URL.
// CREATE INDEX CONCURRENTLY no puede correr dentro de transacción → ejecuta
// statement por statement con autocommit.
//
// Uso: node -r dotenv/config scripts/apply-wave-1-indexes.mjs dotenv_config_path=.env.local

import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

// Preferimos DIRECT_URL (IPv6, no pooler). Si WSL no tiene IPv6 routing,
// fallback a DATABASE_URL pero forzando puerto 5432 (session mode) — el
// pooler en 6543 (transaction mode) NO soporta CREATE INDEX CONCURRENTLY.
// Permitir USE_POOLER=1 para forzar pooler (útil en WSL sin IPv6 routing).
const FORCE_POOLER = process.env.USE_POOLER === "1";
const RAW_URL = (FORCE_POOLER ? process.env.DATABASE_URL : process.env.DIRECT_URL)
  || process.env.DATABASE_URL
  || process.env.DIRECT_URL;
if (!RAW_URL) {
  console.error("[wave-1] DIRECT_URL or DATABASE_URL missing — aborting");
  process.exit(1);
}
const url = new URL(RAW_URL);
const isPooler = url.hostname.includes("pooler.supabase.com");
if (isPooler && url.port === "6543") {
  console.log(`[wave-1] forzando session mode (5432) en pooler — CONCURRENTLY no funciona en transaction mode`);
  url.port = "5432";
}
const DIRECT_URL = url.toString();

const SQL_FILE = "prisma/migrations/proposed-db-indexes-wave-1.sql";
const raw = readFileSync(SQL_FILE, "utf8");

// Split por ';' fuera de comentarios — simple porque el archivo es predecible.
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`[wave-1] ${statements.length} statements detected. Connecting to Supabase…`);

// WSL2 resuelve hostname a IPv6 pero no tiene ruta IPv6.
// Resuelvo a IPv4 manualmente y paso la IP como host.
const originalHost = url.hostname;
let ipv4;
try {
  const r = await lookup(originalHost, { family: 4 });
  ipv4 = r.address;
  console.log(`[wave-1] resolved ${originalHost} → ${ipv4} (IPv4)`);
} catch (e) {
  console.error(`[wave-1] DNS IPv4 lookup failed for ${originalHost}: ${e?.message ?? e}`);
  console.error(`[wave-1] tip: el direct URL de Supabase solo tiene AAAA (IPv6).`);
  console.error(`[wave-1] usá DATABASE_URL (pooler con IPv4) — el script ya cambia 6543→5432 para soportar CONCURRENTLY.`);
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
  console.log(`[wave-1] connected in ${Date.now() - t0}ms`);

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

  console.log(`\n[wave-1] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 2 : 0);
} catch (e) {
  console.error(`[wave-1] connection error: ${e?.message ?? e}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
