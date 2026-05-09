#!/usr/bin/env node
/**
 * scripts/backfill-l29733-chain.mjs
 *
 * Backfill de hashes SHA-256 para entradas existentes en ActivityLog
 * que corresponden a registros Ley 29733 ([L29733]%).
 *
 * El chain de hashes es inmutable hacia adelante: este script construye
 * la cadena desde el inicio (entrada más antigua) asignando:
 *   - previousHash: hash de la entrada anterior (o "GENESIS" para la primera)
 *   - hash:         sha256(previousHash + ":" + buildHashData(entry))
 *
 * Idempotente: si una entrada ya tiene hash en su campo `detail`, se salta.
 *
 * CONEXION: usa DATABASE_URL (pooler Supabase) con puerto forzado a 5432
 * (session mode) para evitar problemas con prepared statements en pgBouncer.
 * Patrón idéntico a apply-wave-1-indexes.mjs.
 *
 * Uso:
 *   node -r dotenv/config scripts/backfill-l29733-chain.mjs dotenv_config_path=.env.local
 *
 *   Con flag DRY_RUN=1 imprime qué actualizaría sin escribir:
 *   DRY_RUN=1 node -r dotenv/config scripts/backfill-l29733-chain.mjs dotenv_config_path=.env.local
 *
 * Requisito: DATABASE_URL (pooler IPv4 con puerto 5432) en env.
 * Si DATABASE_URL apunta al puerto 6543 (transaction mode), el script lo
 * cambia a 5432 automáticamente.
 */

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

// ── Parámetros ────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = 100; // procesar N entradas por vez para evitar timeouts

// ── Conexión — mismo patrón que apply-wave-1-indexes.mjs ─────────────────────

const RAW_URL = process.env.DATABASE_URL;
if (!RAW_URL) {
  console.error("[backfill-l29733] DATABASE_URL no definida — aborting");
  process.exit(1);
}

const url = new URL(RAW_URL);

// Forzar session mode (5432) — pgBouncer en transaction mode (6543)
// no soporta queries con cursor y puede fallar en scripts largos.
const isPooler = url.hostname.includes("pooler.supabase.com");
if (isPooler && url.port === "6543") {
  console.log("[backfill-l29733] pooler detectado en 6543 — forzando session mode (5432)");
  url.port = "5432";
}

// WSL2: resolver a IPv4 para evitar problemas de routing IPv6
const originalHost = url.hostname;
let ipv4 = originalHost;
try {
  const r = await lookup(originalHost, { family: 4 });
  ipv4 = r.address;
  console.log(`[backfill-l29733] DNS ${originalHost} → ${ipv4} (IPv4)`);
} catch {
  console.warn(`[backfill-l29733] DNS IPv4 lookup failed — usando hostname original ${originalHost}`);
}

const client = new Client({
  host: ipv4,
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, "") || "postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false, servername: originalHost },
});

// ── Hash chain helpers (replicados de lib/audit/hash-chain.ts) ────────────────
// No importamos desde TypeScript directamente para evitar transpilación.

/**
 * @param {string} data
 * @param {string} previousHash
 * @returns {string}
 */
function calculateHash(data, previousHash) {
  return createHash("sha256")
    .update(`${previousHash}:${data}`)
    .digest("hex");
}

/**
 * @param {{ action: string, entity: string, entityId: string | null, detail: string, user: string, tenantId: string, createdAt: Date | string }} entry
 * @returns {string}
 */
function buildHashData(entry) {
  const ts =
    entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : entry.createdAt;
  return `${entry.action}|${entry.entity}|${entry.entityId ?? ""}|${entry.detail}|${entry.user}|${entry.tenantId}|${ts}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`[backfill-l29733] Conectando a DB…${DRY_RUN ? " (DRY RUN — sin escrituras)" : ""}`);
await client.connect();

try {
  // Traer TODAS las entradas [L29733] ordenadas por createdAt ASC.
  // Agrupamos por tenantId para construir una chain separada por tenant.
  const { rows: allEntries } = await client.query(`
    SELECT
      id,
      action,
      entity,
      "entityId",
      detail,
      "user",
      "tenantId",
      "createdAt"::text AS "createdAt"
    FROM "ActivityLog"
    WHERE entity LIKE '[L29733]%'
    ORDER BY "tenantId", "createdAt" ASC
  `);

  console.log(`[backfill-l29733] Entradas [L29733] encontradas: ${allEntries.length}`);

  if (allEntries.length === 0) {
    console.log("[backfill-l29733] Nada que backfill. Saliendo.");
    await client.end();
    process.exit(0);
  }

  // Agrupar por tenantId
  /** @type {Map<string, typeof allEntries>} */
  const byTenant = new Map();
  for (const row of allEntries) {
    const key = row.tenantId ?? "unknown";
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key).push(row);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [tenantId, entries] of byTenant) {
    console.log(`[backfill-l29733] Tenant: ${tenantId} — ${entries.length} entradas`);

    let previousHash = "GENESIS";

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Parsear detail actual para verificar idempotencia
      let parsedDetail = null;
      try {
        parsedDetail = JSON.parse(entry.detail);
      } catch {
        // detail no es JSON — lo tratamos como sin hash
      }

      // Idempotencia: si ya tiene hash calculado, lo usamos como previousHash
      // para mantener la cadena consistente, pero NO re-escribimos esa entrada.
      if (parsedDetail?.hash && typeof parsedDetail.hash === "string") {
        previousHash = parsedDetail.hash;
        totalSkipped++;
        if (i % BATCH_SIZE === 0) {
          process.stdout.write(`\r[backfill-l29733] ${tenantId}: ${i}/${entries.length} (${totalSkipped} skip, ${totalUpdated} upd)`);
        }
        continue;
      }

      // Calcular hash nuevo
      const originalDetail =
        parsedDetail?.originalDetail ?? entry.detail;

      const hashData = buildHashData({
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        detail: originalDetail,
        user: entry.user,
        tenantId: entry.tenantId ?? "unknown",
        createdAt: entry.createdAt,
      });

      const hash = calculateHash(hashData, previousHash);

      // Nuevo detail con hash embebido (mismo formato que writeAuditEntry)
      const newDetail = JSON.stringify({
        originalDetail,
        ley29733: true,
        hash,
        previousHash,
      });

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "ActivityLog" SET detail = $1 WHERE id = $2`,
          [newDetail, entry.id],
        );
      } else {
        console.log(`  [DRY] id=${entry.id} previousHash=${previousHash.slice(0, 12)}… → hash=${hash.slice(0, 12)}…`);
      }

      previousHash = hash;
      totalUpdated++;

      if (i % BATCH_SIZE === 0 && !DRY_RUN) {
        process.stdout.write(`\r[backfill-l29733] ${tenantId}: ${i}/${entries.length} (${totalSkipped} skip, ${totalUpdated} upd)`);
      }
    }

    process.stdout.write("\n");
    console.log(`[backfill-l29733] Tenant ${tenantId}: DONE`);
  }

  console.log(`\n[backfill-l29733] COMPLETADO`);
  console.log(`  Actualizadas: ${totalUpdated}`);
  console.log(`  Saltadas (ya tenían hash): ${totalSkipped}`);
  if (DRY_RUN) {
    console.log("  DRY RUN — ninguna fila fue modificada.");
  }
} finally {
  await client.end();
}
