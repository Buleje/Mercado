#!/usr/bin/env node
// Aplica prisma/migrations/20260825140000_forest_party_categoria/migration.sql
// (categoria + codigoCtp en ForestParty). `prisma migrate deploy` cuelga contra
// el pooler en transaction mode (6543) y DIRECT_URL es inalcanzable desde esta
// red WSL — mismo patrón que scripts/apply-377-migration.mjs: pooler forzado a
// session mode (5432) + IPv4 resuelto a mano.
//
// Uso: node -r dotenv/config scripts/apply-forest-party-categoria-migration.mjs dotenv_config_path=.env.local

import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

const FORCE_POOLER = process.env.USE_POOLER === "1";
const RAW_URL = (FORCE_POOLER ? process.env.DATABASE_URL : process.env.DIRECT_URL)
  || process.env.DATABASE_URL
  || process.env.DIRECT_URL;
if (!RAW_URL) {
  console.error("[forest-party-categoria] DIRECT_URL or DATABASE_URL missing — aborting");
  process.exit(1);
}
const url = new URL(RAW_URL);
const isPooler = url.hostname.includes("pooler.supabase.com");
if (isPooler && url.port === "6543") {
  console.log(`[forest-party-categoria] forzando session mode (5432) en pooler`);
  url.port = "5432";
}

const SQL_FILE = process.env.SQL_FILE || "prisma/migrations/20260825140000_forest_party_categoria/migration.sql";
const raw = readFileSync(SQL_FILE, "utf8");
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`[forest-party-categoria] ${statements.length} statements detected. Connecting to Supabase…`);

const originalHost = url.hostname;
let ipv4;
try {
  const r = await lookup(originalHost, { family: 4 });
  ipv4 = r.address;
  console.log(`[forest-party-categoria] resolved ${originalHost} → ${ipv4} (IPv4)`);
} catch (e) {
  console.error(`[forest-party-categoria] DNS IPv4 lookup failed for ${originalHost}: ${e?.message ?? e}`);
  process.exit(1);
}

const client = new Client({
  host: ipv4,
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, "") || "postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false, servername: originalHost },
  connectionTimeoutMillis: 15_000,
});

const t0 = Date.now();

try {
  await client.connect();
  console.log(`[forest-party-categoria] connected in ${Date.now() - t0}ms`);

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

  console.log(`\n[forest-party-categoria] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 2 : 0);
} catch (e) {
  console.error(`[forest-party-categoria] connection error: ${e?.message ?? e}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
