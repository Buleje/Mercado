import "server-only";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CajaNoAbiertaError, CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import type { LineaDePago } from "@/lib/caja/desglosar-pago";
import { logger } from "@/lib/logger";

/**
 * Anota en la caja las líneas de una venta del POS (una por medio de pago) y
 * dice cuáles NO pudo anotar (F4, revisión de seguridad).
 *
 * Antes era fire-and-forget: si la caja se cerraba entre la venta y su
 * movimiento, `addMovement` tiraba `CajaNoAbiertaError` (409), el `.catch(warn)`
 * se lo tragaba y la venta respondía 201 con su plata fuera del arqueo, sin
 * aviso — con pago mixto, sólo una parte. Ahora:
 *   · si la caja se cerró a mitad, se relee la caja abierta y se reintenta UNA
 *     vez lo que falta (alguien pudo abrir otra);
 *   · lo que igual no entra vuelve en `sinAnotar` con el motivo, para que la
 *     respuesta de la venta lo diga y el POS lo muestre;
 *   · la carrera y el fallo de la base van a `logger.error` (Sentry). Vender sin
 *     caja abierta es un modo de uso normal (no todos los negocios abren caja):
 *     `logger.warn`, no una alerta.
 */
export type MotivoSinAnotar = "sin_caja" | "se_cerro" | "fallo";

export interface ResultadoAnotarVenta {
  sinAnotar: LineaDePago[];
  motivo: MotivoSinAnotar | null;
}

export async function anotarVentaEnCaja(
  tenantId: string,
  saleId: string,
  lineas: ReadonlyArray<LineaDePago>,
): Promise<ResultadoAnotarVenta> {
  if (!tenantId) throw new Error("tenantId is required");
  const pendientes = lineas.filter((l) => l.amount > 0);
  if (pendientes.length === 0) return { sinAnotar: [], motivo: null };

  let motivo: MotivoSinAnotar | null = null;
  for (let intento = 0; intento < 2 && pendientes.length > 0; intento++) {
    const caja = await CashRegistersMovementsDB.findCurrentOpenRegister(tenantId);
    if (!caja) {
      motivo = motivo ?? "sin_caja";
      break;
    }
    motivo = null;
    while (pendientes.length > 0) {
      const linea = pendientes[0];
      try {
        await CashRegistersDB.addMovement(
          caja.id,
          {
            type: "venta",
            amount: linea.amount,
            method: linea.method,
            description: lineas.length > 1 ? `Venta ${saleId} · ${linea.method}` : `Venta ${saleId}`,
            saleId,
          },
          tenantId,
        );
        pendientes.shift();
      } catch (err) {
        if (err instanceof CajaNoAbiertaError) {
          motivo = "se_cerro";
          break; // se relee la caja abierta y se reintenta una vez
        }
        motivo = "fallo";
        logger.error("[sales] no se pudo anotar la venta en la caja", { tenantId, saleId, error: String(err) });
        return { sinAnotar: pendientes, motivo };
      }
    }
  }

  if (pendientes.length === 0) return { sinAnotar: [], motivo: null };
  const detalle = { tenantId, saleId, motivo, lineas: pendientes };
  if (motivo === "se_cerro") logger.error("[sales] la caja se cerró antes de anotar la venta", detalle);
  else logger.warn("[sales] venta sin caja abierta: no se anotó en la caja", detalle);
  return { sinAnotar: pendientes, motivo };
}
