/** Tool: generar_boleta_sunat — SUNAT boleta de venta with IGV calculation. */

import { query } from "../db.js";
import type { BoletaResult } from "../types.js";

const IGV_RATE = 0.18;
interface BoletaItem { description: string; quantity: number; unit_price: number }
interface BoletaCliente { name: string; document_type: string; document_number: string }

/** @param tenantId Tenant isolation (rule #3) @param items VAT-included @param cliente buyer */
export async function generarBoletaSunat(
  tenantId: string, items: BoletaItem[], cliente: BoletaCliente
): Promise<BoletaResult> {
  const configs = await query<{
    ruc: string; razon_social: string; boleta_series: string; last_boleta_num: number;
  }>(`SELECT ruc, "razonSocial" AS razon_social, "boletaSeries" AS boleta_series,
      "lastBoletaNum" AS last_boleta_num FROM "TenantSunatConfig" WHERE "tenantId"=$1`, [tenantId]);

  if (configs.length === 0) {
    throw new Error(`No se encontro config SUNAT para tenant "${tenantId}". Registrar en Admin > Facturacion.`);
  }

  const totalConIgv = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const subtotal = +(totalConIgv / (1 + IGV_RATE)).toFixed(2);
  const igv = +(totalConIgv - subtotal).toFixed(2);
  const total = +(subtotal + igv).toFixed(2);

  const nextNumRows = await query<{ next_num: number }>(
    `UPDATE "TenantSunatConfig" SET "lastBoletaNum"="lastBoletaNum"+1, "updatedAt"=NOW()
     WHERE "tenantId"=$1 RETURNING "lastBoletaNum" AS next_num`, [tenantId]);
  const boletaNum = nextNumRows[0].next_num;
  const series = configs[0].boleta_series;
  const fullNumber = `${series}-${String(boletaNum).padStart(8, "0")}`;

  await query(
    `INSERT INTO "SunatInvoice"
       (id,"tenantId",type,series,number,"customerName","customerRuc",subtotal,igv,total,"sunatStatus","createdAt","updatedAt")
     VALUES (gen_random_uuid()::text,$1,'boleta',$2,$3,$4,$5,$6,$7,$8,'pending',NOW(),NOW())`,
    [tenantId, series, boletaNum, cliente.name, cliente.document_number, subtotal, igv, total]);

  return {
    series, number: boletaNum, fullNumber, subtotal, igv, total,
    customerName: cliente.name,
    customerDocument: `${cliente.document_type}: ${cliente.document_number}`,
    items: items.map((i) => ({
      description: i.description, quantity: i.quantity, unitPrice: i.unit_price,
      subtotal: +(i.quantity * i.unit_price).toFixed(2),
    })),
    createdAt: new Date().toISOString(),
  };
}
