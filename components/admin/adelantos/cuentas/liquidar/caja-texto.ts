/**
 * Qué pasó con la caja al liquidar, en el idioma del mostrador (ADR-413 §5).
 *
 * Se lee de `LiquidacionDTO.caja.resultado` — el campo YA persistido por el
 * servidor después de correr `moverCaja` (`liquidacion-cuenta.db.ts`), no se
 * recalcula acá: duplicar esa lógica en el cliente es la misma cuenta dicha
 * dos veces, y el día que cambien una sin la otra, mienten distinto.
 *
 * `tono`: "ok" es una confirmación (se anotó); "aviso" pide leerlo con
 * atención porque algo no salió solo (sin caja, falló, o no se sabe) — no
 * pueden pintarse igual, una tapa a la otra.
 *
 * `null` = no hay nada que decir (no hubo pago, o se anota a mano y ya se dijo).
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { fmtMon } from "../../shared";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";

export type ResultadoCaja = { texto: string; tono: "ok" | "aviso" };

export function textoResultadoCaja(
  liq: Pick<LiquidacionDTO, "pago" | "caja">,
): ResultadoCaja | null {
  if (!liq.pago) return null;
  const monto = fmtMon(liq.pago.monto);
  switch (liq.caja.resultado) {
    case "movida":
      return {
        texto:
          liq.pago.direccion === "recibido"
            ? `Entró a la caja ${monto}`
            : `Salió de la caja ${monto}`,
        tono: "ok",
      };
    case "sin_caja":
      return { texto: "No había caja abierta: anótalo a mano", tono: "aviso" };
    case "fallo":
      return { texto: "No se pudo anotar en la caja: revisa el arqueo", tono: "aviso" };
    case "no_mover":
      // Se eligió no anotarla: nada que avisar, fue a propósito.
      return null;
    default:
      // `null`: el proceso murió entre el commit y la caja (ADR-413 §5) — sólo
      // puede pasar si se había pedido moverla, en efectivo.
      return liq.pago.moverCaja && liq.pago.metodo === "efectivo"
        ? { texto: "No se sabe si se anotó en la caja", tono: "aviso" }
        : null;
  }
}
