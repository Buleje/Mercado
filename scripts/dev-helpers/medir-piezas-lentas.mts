/**
 * medir-piezas-lentas.mts (04-11-2026) — cronometra por separado cada consulta de
 * GET /api/customers (1,4 s) y GET /api/compras/excepciones (1,9 s) para saber
 * cuál pesa antes de tocar nada. Solo lectura.
 *
 * También CustomersDB.comprasPorCliente (CRM, ?compras=1).
 *
 * Uso: scripts/dev-helpers/tsx-servidor.sh scripts/dev-helpers/medir-piezas-lentas.mts <tenantId> [--json <archivo>]
 *      (--json guarda la salida completa de getAllConDeuda + datosParaExcepciones para
 *       comparar antes/después de un arreglo: tiene que dar idéntica).
 */
import { writeFileSync } from "node:fs";
import { CustomersDB } from "@/lib/db/customers.db";
import { PurchasesDB } from "@/lib/db/purchases.db";
import { SupplierReturnsDB } from "@/lib/db/supplier-returns.db";
import { datosParaExcepciones } from "@/lib/compras/datos-de-compras";

const [tenantId, flag, salida] = process.argv.slice(2);
if (!tenantId) {
  console.error("Uso: tsx-servidor.sh scripts/dev-helpers/medir-piezas-lentas.mts <tenantId> [--json <archivo>]");
  process.exit(2);
}

async function t<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
  const ini = performance.now();
  const r = await fn();
  const ms = performance.now() - ini;
  const n = Array.isArray(r) ? r.length : r instanceof Map ? r.size : "";
  console.log(`${nombre.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms  ${n}`);
  return r;
}

// Calentar la conexión para que la 1.ª medida no cargue el arranque.
await CustomersDB.getAll(tenantId, 1);

for (let vuelta = 1; vuelta <= 2; vuelta++) {
  console.log(`— vuelta ${vuelta} —`);
  await t("CustomersDB.getAll", () => CustomersDB.getAll(tenantId));
  await t("CustomersDB.deudaDeFiados", () => CustomersDB.deudaDeFiados(tenantId));
  await t("CustomersDB.getAllConDeuda (junto)", () => CustomersDB.getAllConDeuda(tenantId));
  const ordenes = await t("PurchasesDB.getAll", () => PurchasesDB.getAll(tenantId));
  await t("SupplierReturnsDB.listWithItems", () => SupplierReturnsDB.listWithItems(tenantId));
  await t("PurchasesDB.datosDeSeguimiento", () => PurchasesDB.datosDeSeguimiento(tenantId, ordenes.map((o) => o.id), false));
  await t("datosParaExcepciones (sin plata)", () => datosParaExcepciones(tenantId, false));
  await t("CustomersDB.comprasPorCliente", () => CustomersDB.comprasPorCliente(tenantId));
}

if (flag === "--json" && salida) {
  const ahora = new Date("2026-11-04T12:00:00Z");
  const clientes = await CustomersDB.getAllConDeuda(tenantId);
  const deudas = await CustomersDB.deudaDeFiados(tenantId, ahora);
  const exc = await datosParaExcepciones(tenantId, false);
  const compras = [...(await CustomersDB.comprasPorCliente(tenantId, ahora)).entries()].sort(([a], [b]) => a.localeCompare(b));
  writeFileSync(salida, JSON.stringify({ clientes, deudas: [...deudas.entries()], exc, compras }, null, 1));
  console.log(`salida → ${salida}`);
}
process.exit(0);
