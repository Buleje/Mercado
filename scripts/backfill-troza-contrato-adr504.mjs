#!/usr/bin/env node
/**
 * backfill-troza-contrato-adr504.mjs — cada troza toma el permiso de su ingreso
 * (`WoodEntryTroza.contratoId` = `WoodEntry.contratoId`, ADR-504 paso 1).
 *
 * Uso:
 *   node -r dotenv/config scripts/backfill-troza-contrato-adr504.mjs [--ensayo] [--lote 50] dotenv_config_path=.env.local
 *
 * · Idempotente: sólo toca trozas cuyo permiso DIFIERE del de su ingreso
 *   (`IS DISTINCT FROM`); la 2.ª corrida da «0 pendientes». Re-correrlo antes
 *   del paso 3: mientras producción corra código viejo, sus trozas nuevas nacen
 *   en NULL.
 * · Por tenant (`tenantId` en cada WHERE) y en lotes chicos, cada lote en su
 *   propia transacción con `SET LOCAL lock_timeout` — LOCAL, nunca SET SESSION
 *   (memoria pooler-set-session-se-pega). `FOR UPDATE SKIP LOCKED`: una troza
 *   que otra pantalla está escribiendo se saltea y queda contada como pendiente.
 * · Por el pooler de SESIÓN (:5432), como `aplicar-migracion-sesion.mjs`.
 * · `--ensayo` sólo cuenta, no escribe.
 */
import pg from "pg";

const ensayo = process.argv.includes("--ensayo");
const iLote = process.argv.indexOf("--lote");
const lote = Math.max(1, Math.min(500, Number(iLote > 0 ? process.argv[iLote + 1] : 50) || 50));

if (!process.env.DATABASE_URL) {
  console.error("[backfill] falta DATABASE_URL (¿dotenv_config_path=.env.local?)");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
if (!url.host.includes("pooler.supabase.com")) {
  console.error(`[backfill] DATABASE_URL no apunta al pooler de Supabase (${url.host})`);
  process.exit(1);
}
url.port = "5432";
url.searchParams.delete("pgbouncer");
url.searchParams.delete("connection_limit");

const PENDIENTES = `
  SELECT t."tenantId", count(*)::int AS pendientes,
         count(*) FILTER (WHERE e."contratoId" IS NOT NULL)::int AS a_permiso,
         count(*) FILTER (WHERE e."contratoId" IS NULL)::int AS a_null
  FROM "WoodEntryTroza" t
  JOIN "WoodEntry" e ON e."id" = t."woodEntryId" AND e."tenantId" = t."tenantId"
  WHERE t."contratoId" IS DISTINCT FROM e."contratoId"
  GROUP BY 1 ORDER BY 1`;

const UN_LOTE = `
  UPDATE "WoodEntryTroza" t SET "contratoId" = e."contratoId"
  FROM "WoodEntry" e
  WHERE t."id" IN (
      SELECT t2."id" FROM "WoodEntryTroza" t2
      JOIN "WoodEntry" e2 ON e2."id" = t2."woodEntryId" AND e2."tenantId" = t2."tenantId"
      WHERE t2."tenantId" = $1 AND t2."contratoId" IS DISTINCT FROM e2."contratoId"
      ORDER BY t2."id" LIMIT $2
      FOR UPDATE OF t2 SKIP LOCKED)
    AND t."tenantId" = $1 AND e."tenantId" = $1 AND e."id" = t."woodEntryId"
  RETURNING t."id"`;

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const antes = (await c.query(PENDIENTES)).rows;
  const total = antes.reduce((a, r) => a + r.pendientes, 0);
  console.log(`[backfill] ${url.host} · ${total} trozas pendientes en ${antes.length} tenants · lote ${lote}${ensayo ? " · ENSAYO (no escribe)" : ""}`);
  for (const r of antes) console.log(`  ${r.tenantId}: ${r.pendientes} (→ permiso ${r.a_permiso} · → NULL ${r.a_null})`);
  if (!ensayo) {
    for (const { tenantId } of antes) {
      let hechas = 0;
      for (let vuelta = 0; vuelta < 10_000; vuelta++) {
        await c.query("BEGIN");
        let n = 0;
        try {
          await c.query("SET LOCAL lock_timeout = '5s'");
          await c.query("SET LOCAL statement_timeout = '30s'");
          n = (await c.query(UN_LOTE, [tenantId, lote])).rowCount ?? 0;
          await c.query("COMMIT");
        } catch (e) {
          await c.query("ROLLBACK").catch((err) => console.error("[backfill] ROLLBACK falló:", err.message));
          throw new Error(`${tenantId} lote ${vuelta + 1}: ${e.message}`);
        }
        hechas += n;
        if (n < lote) break;
        await new Promise((ok) => setTimeout(ok, 200));
      }
      console.log(`  ✓ ${tenantId}: ${hechas} actualizadas`);
    }
    const despues = (await c.query(PENDIENTES)).rows;
    const quedan = despues.reduce((a, r) => a + r.pendientes, 0);
    console.log(`[backfill] después: ${quedan} pendientes${quedan ? " (SKIP LOCKED o escrituras en el medio: volver a correr)" : ""}`);
    if (quedan) process.exitCode = 1;
  }
} catch (e) {
  console.error("[backfill] CORTÓ:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
