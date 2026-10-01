#!/usr/bin/env node
/**
 * ADR-374 — Backfill: pasa la metadata serializada de `Expense.description` a
 * las columnas reales.
 *
 * NO borra el bloque `---META---` de la descripción: esta es la fase EXPAND.
 * Mientras el código siga leyendo el bloque como fallback, quitarlo sería
 * perder datos si algo se revierte. La limpieza es la fase CONTRACT.
 *
 * Idempotente: sólo escribe columnas que estén en NULL, así que se puede
 * correr las veces que haga falta sin pisar lo que alguien ya editó a mano.
 *
 * Uso:
 *   node -r dotenv/config scripts/backfill-374-expense-meta.mjs dotenv_config_path=.env.local
 *   ... --dry   → sólo informa, no escribe
 */

import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;
const DRY = process.argv.includes("--dry");
const SEP = "\n---META---\n";

const RAW_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!RAW_URL) {
  console.error("[374-backfill] falta DATABASE_URL");
  process.exit(1);
}
const url = new URL(RAW_URL);
if (url.hostname.includes("pooler.supabase.com") && url.port === "6543") url.port = "5432";

const host = url.hostname;
const { address: ipv4 } = await lookup(host, { family: 4 }).catch((e) => {
  console.error(`[374-backfill] DNS falló para ${host}: ${e?.message ?? e}`);
  process.exit(1);
});

const client = new Client({
  host: ipv4,
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, "") || "postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false, servername: host },
  connectionTimeoutMillis: 15_000,
});

/** Los valores que el resto del sistema acepta. Uno fuera de lista se ignora. */
const FRECUENCIAS = new Set(["mensual", "quincenal", "semanal", "anual", "unico"]);
const METODOS = new Set(["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"]);

await client.connect();
console.log(`[374-backfill] conectado${DRY ? " (dry-run)" : ""}`);

const { rows } = await client.query(
  `SELECT id, description, date, recurring, "frequency", "paymentMethod", "supplierName", "paidAt"
     FROM "Expense"`,
);
console.log(`[374-backfill] ${rows.length} gastos en total`);

let conMeta = 0;
let actualizados = 0;
let pagosFechados = 0;

for (const row of rows) {
  const idx = (row.description ?? "").indexOf(SEP);
  let meta = {};
  if (idx !== -1) {
    conMeta++;
    try {
      const parsed = JSON.parse(row.description.slice(idx + SEP.length));
      if (parsed && typeof parsed === "object") meta = parsed;
    } catch {
      console.warn(`  ⚠ meta ilegible en ${row.id} — se salta`);
    }
  }

  const sets = [];
  const vals = [];
  const set = (col, valor) => { vals.push(valor); sets.push(`"${col}" = $${vals.length}`); };

  if (row.frequency == null && FRECUENCIAS.has(meta.frequency)) set("frequency", meta.frequency);
  if (row.paymentMethod == null && METODOS.has(meta.paymentMethod)) set("paymentMethod", meta.paymentMethod);
  if (row.supplierName == null && typeof meta.supplierName === "string" && meta.supplierName.trim()) {
    set("supplierName", meta.supplierName.trim());
  }
  if (typeof meta.paymentDay === "number" && Number.isInteger(meta.paymentDay)) set("paymentDay", meta.paymentDay);
  if (typeof meta.notes === "string" && meta.notes.trim()) set("notes", meta.notes.trim());

  // Un gasto ejecutado (no plantilla) es plata que ya salió: su fecha ES la
  // fecha de pago. Las plantillas no se fechan — todavía no se pagó nada.
  if (row.paidAt == null && row.recurring === false) {
    set("paidAt", row.date);
    pagosFechados++;
  }

  if (sets.length === 0) continue;
  actualizados++;
  if (DRY) {
    console.log(`  · ${row.id}: ${sets.join(", ")}`);
    continue;
  }
  vals.push(row.id);
  await client.query(`UPDATE "Expense" SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
}

console.log(
  `[374-backfill] ${conMeta} traían bloque serializado · ${actualizados} filas ${DRY ? "se actualizarían" : "actualizadas"} · ${pagosFechados} con fecha de pago`,
);
await client.end();
