#!/usr/bin/env node
// Aplica prisma/migrations/adr-380-registro-plantacion-forestal.sql (ADR-380).
// Sin CREATE INDEX CONCURRENTLY (tablas nuevas y vacías) → corre bien por el
// pooler transaction-mode (6543), no hace falta DIRECT_URL/session mode.
//
// Uso: node -r dotenv/config scripts/apply-380-migration.mjs dotenv_config_path=.env.local

import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

// DIRECT_URL primero (fuera del pooler); si su hostname no resuelve en esta
// red (gotcha conocido: DNS de Supabase directo falla en algunas redes WSL),
// cae a DATABASE_URL (pooler) — DDL simple sin CONCURRENTLY funciona ahí.
async function resolvable(hostname) {
  try {
    await lookup(hostname, { family: 4 });
    return true;
  } catch {
    return false;
  }
}

const directUrl = process.env.DIRECT_URL;
const poolerUrl = process.env.DATABASE_URL;
let RAW_URL = poolerUrl;
if (directUrl) {
  const h = new URL(directUrl).hostname;
  if (await resolvable(h)) {
    RAW_URL = directUrl;
    console.log(`[adr-380] usando DIRECT_URL (${h} resuelve)`);
  } else {
    console.log(`[adr-380] DIRECT_URL (${h}) no resuelve en esta red — cae a DATABASE_URL (pooler)`);
  }
}
if (!RAW_URL) {
  console.error("[adr-380] DIRECT_URL or DATABASE_URL missing — aborting");
  process.exit(1);
}

const url = new URL(RAW_URL);
const SQL_FILE = process.env.SQL_FILE || "prisma/migrations/adr-380-registro-plantacion-forestal.sql";
const raw = readFileSync(SQL_FILE, "utf8");

const sinComentarios = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = sinComentarios
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`[adr-380] ${statements.length} statements detected. Connecting…`);

const originalHost = url.hostname;
let host = originalHost;
try {
  const r = await lookup(originalHost, { family: 4 });
  host = r.address;
  console.log(`[adr-380] resolved ${originalHost} → ${host} (IPv4)`);
} catch (e) {
  console.error(`[adr-380] DNS IPv4 lookup failed for ${originalHost}: ${e?.message ?? e}`);
  process.exit(1);
}

const client = new Client({
  host,
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
  console.log(`[adr-380] connected in ${Date.now() - t0}ms`);

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

  console.log(`\n[adr-380] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 2 : 0);
} catch (e) {
  console.error(`[adr-380] connection error: ${e?.message ?? e}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
