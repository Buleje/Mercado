import "server-only";
import { CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import { logger } from "@/lib/logger";

/**
 * El puente entre un adelanto y la caja.
 *
 * EL HUECO QUE TAPA. Un adelanto es plata que SALE del cajón, y la caja no se
 * enteraba: al cerrar el día el arqueo no cuadraba y nadie sabía por qué. El
 * módulo llevaba su propia contabilidad de saldos, pero el efectivo físico
 * quedaba fuera del sistema.
 *
 * TRES REGLAS QUE NO SON OBVIAS
 *
 * 1. **Nunca bloquea el adelanto.** Si no hay caja abierta, el adelanto se
 *    registra igual: la plata ya salió, y perder el registro del préstamo por no
 *    poder anotar el movimiento sería el peor de los dos errores. Se devuelve
 *    `sinCaja` para que la pantalla lo diga antes de guardar.
 *
 * 2. **Sólo el efectivo mueve la caja.** Un adelanto por transferencia o Yape no
 *    toca el cajón. El método viaja al movimiento y quien lo registra elige.
 *
 * 3. **Anular NO revierte solo.** Cancelar un adelanto puede significar dos cosas
 *    opuestas: que fue un error y la plata nunca salió, o que se está dando por
 *    perdida. Sólo la primera devuelve efectivo al cajón, y eso lo sabe la
 *    persona, no el sistema. Por eso la reversión es un parámetro explícito.
 */

export type MetodoPago = "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";

export interface ResultadoMovimiento {
  /** `true` si no había caja abierta: el adelanto igual se guardó. */
  sinCaja: boolean;
  movimientoId?: string;
}

/**
 * Anota un movimiento de caja ligado a un adelanto.
 *
 * @param etiqueta lo que se lee en el arqueo: lleva el código de operación para
 *   poder ir del movimiento al adelanto y al revés.
 */
export async function moverCaja(
  tenantId: string,
  opciones: {
    tipo: "ingreso" | "egreso";
    monto: number;
    metodo: MetodoPago;
    etiqueta: string;
  },
): Promise<ResultadoMovimiento> {
  if (!(opciones.monto > 0)) return { sinCaja: false };

  try {
    const caja = await CashRegistersMovementsDB.findCurrentOpenRegister(tenantId);
    if (!caja) {
      logger.warn("[adelantos] sin caja abierta: el movimiento no se anota", {
        tenantId,
        etiqueta: opciones.etiqueta,
      });
      return { sinCaja: true };
    }
    const mov = await CashRegistersMovementsDB.createMovement({
      cashRegisterId: caja.id,
      type: opciones.tipo,
      amount: Math.round(opciones.monto * 100) / 100,
      method: opciones.metodo,
      description: opciones.etiqueta,
    });
    return { sinCaja: false, movimientoId: mov.id };
  } catch (err) {
    // Que falle la anotación NO puede tumbar el adelanto: se registra el error y
    // se sigue. El adelanto es el dato importante; el movimiento se puede cargar
    // a mano después.
    logger.error("[adelantos] no se pudo anotar el movimiento de caja", {
      tenantId,
      etiqueta: opciones.etiqueta,
      error: String(err),
    });
    return { sinCaja: false };
  }
}

/** Cómo se lee el egreso en el arqueo. */
export function etiquetaEgreso(codigo: string | null | undefined, persona: string): string {
  return `Adelanto ${codigo ?? ""} · ${persona}`.replace(/\s+/g, " ").trim();
}

/** Cómo se lee la devolución en efectivo. */
export function etiquetaIngreso(codigo: string | null | undefined, persona: string): string {
  return `Liquidación de adelanto ${codigo ?? ""} · ${persona}`.replace(/\s+/g, " ").trim();
}

/** Cómo se lee la reversión cuando el adelanto se anula y la plata vuelve. */
export function etiquetaReversion(codigo: string | null | undefined, persona: string): string {
  return `Anulación de adelanto ${codigo ?? ""} · ${persona} (devolución)`.replace(/\s+/g, " ").trim();
}
