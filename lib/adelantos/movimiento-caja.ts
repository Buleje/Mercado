import "server-only";
import { CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * El puente entre un adelanto (o una liquidación) y la caja.
 *
 * EL HUECO QUE TAPA. Un adelanto es plata que SALE del cajón, y la caja no se
 * enteraba: al cerrar el día el arqueo no cuadraba y nadie sabía por qué. El
 * módulo llevaba su propia contabilidad de saldos, pero el efectivo físico
 * quedaba fuera del sistema.
 *
 * TRES REGLAS QUE NO SON OBVIAS
 *
 * 1. **Sin caja abierta, no bloquea el adelanto.** La plata ya salió, y perder
 *    el registro del préstamo por no poder anotar el movimiento sería el peor
 *    de los dos errores. Se devuelve `sinCaja` para que la pantalla lo diga.
 *
 * 2. **El método viaja al movimiento.** Un adelanto por Yape o transferencia se
 *    anota con su método y NO cuenta en el efectivo del arqueo
 *    (`saldoEsperadoDeCaja`): se muestra aparte.
 *
 * 3. **Anular NO revierte solo.** Cancelar un adelanto puede significar dos cosas
 *    opuestas: que fue un error y la plata nunca salió, o que se está dando por
 *    perdida. Sólo la primera devuelve efectivo al cajón, y eso lo sabe la
 *    persona, no el sistema. Por eso la reversión es un parámetro explícito.
 *
 * ORDEN GLOBAL DE LOCKS (F4, 3ª pasada de seguridad de ADR-448). De afuera
 * hacia adentro; ningún camino los toma al revés:
 *
 *   1. guías de la persona  — `guia-plata:<t>:<claveCandadoGtf>` (`ForestCuentaDB.bloquearGuiasEnTx`)
 *   2. la persona           — `liq:<t>:benef:<id>`, `liq:<t>:parte:<id>`
 *   3. comprobantes         — `liq:<t>:comprobantes`
 *   4. filas de `Adelanto`  — `FOR UPDATE` (alta, entrega, anulación, liquidación)
 *   5. código de la liquidación — `liq:<t>:codigo`
 *   6. **la caja**          — `FOR SHARE` para anotar, SIEMPRE el último lock,
 *                             pegado al commit (`moverCajaEnTx`).
 *
 * El cierre de caja (`CashRegistersDB.close`) toma SÓLO la caja, en `FOR UPDATE`,
 * como primera sentencia, y no bloquea nada más: nunca retiene la caja mientras
 * espera un adelanto, así que no puede cerrar un ciclo (caja → adelanto no existe).
 */

export type MetodoPago = "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";

export interface ResultadoMovimiento {
  /** `true` si no había caja abierta: el adelanto igual se guardó. */
  sinCaja: boolean;
  movimientoId?: string;
}

/**
 * Anota un movimiento de caja DENTRO de la transacción de quien llama (ADR-448,
 * revisión de seguridad): el alta, la entrega, la anulación o la liquidación y
 * su movimiento se confirman juntos o no se confirma ninguno.
 *
 * Por qué ya no «después del commit»: entre el alta guardada y el egreso anotado
 * pasaban 0,8–2 s (medido en 13 filas reales), y en ese hueco `corregirDireccion`
 * no veía el movimiento: DADO X → RECIBIDO → devolver X = la persona cobraba 2X.
 * Si la base falla al anotar, NO se guarda nada y la pantalla muestra el error
 * para reintentar.
 *
 * El lock (F4): la caja se toma en `FOR SHARE` antes de insertar. Si alguien la
 * está cerrando, esto espera; si el cierre confirma, la caja ya no está
 * «abierta» y vuelve `sinCaja` — el movimiento no entra en una caja cerrada. Si
 * esto llega primero, el cierre espera al commit y lo cuenta. Llamalo como
 * ÚLTIMO lock de tu transacción (orden global, arriba).
 *
 * @param etiqueta lo que se lee en el arqueo: lleva el código de operación para
 *   poder ir del movimiento al adelanto y al revés.
 */
export async function moverCajaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  opciones: { tipo: "ingreso" | "egreso"; monto: number; metodo: MetodoPago; etiqueta: string },
): Promise<ResultadoMovimiento> {
  if (!(opciones.monto > 0)) return { sinCaja: false };
  const caja = await CashRegistersMovementsDB.bloquearCajaAbiertaEnTx(tx, tenantId);
  if (!caja) {
    logger.warn("[adelantos] sin caja abierta: el movimiento no se anota", { tenantId, etiqueta: opciones.etiqueta });
    return { sinCaja: true };
  }
  const mov = await CashRegistersMovementsDB.createMovementEnTx(tx, tenantId, {
    cashRegisterId: caja.id,
    type: opciones.tipo,
    amount: Math.round(opciones.monto * 100) / 100,
    method: opciones.metodo,
    description: opciones.etiqueta,
  });
  return { sinCaja: false, movimientoId: mov.id };
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

/**
 * Cómo se lee en el arqueo la plata de un adelanto RECIBIDO (ADR-448): el alta
 * entra, la devolución y la anulación salen. Una sola función con el momento,
 * y no tres, para que las etiquetas de lo dado sigan siendo exactamente las de
 * antes (el historial de finanzas reconoce el egreso de un adelanto DADO por su
 * código; el de un recibido no es un duplicado, es plata que salió).
 */
export function etiquetaRecibido(
  momento: "alta" | "devolucion" | "anulacion",
  codigo: string | null | undefined,
  persona: string,
): string {
  const cod = codigo ?? "";
  const texto =
    momento === "alta"
      ? `Adelanto recibido ${cod} · ${persona}`
      : momento === "devolucion"
        ? `Devolución de adelanto recibido ${cod} · ${persona}`
        : `Anulación de adelanto recibido ${cod} · ${persona} (devolución)`;
  return texto.replace(/\s+/g, " ").trim();
}

/** Cómo se lee en el arqueo el pago de una liquidación de cuenta (ADR-413). */
export function etiquetaLiquidacion(codigo: string, persona: string): string {
  return `Liquidación ${codigo} · ${persona}`.replace(/\s+/g, " ").trim();
}

/** Cómo se lee la devolución cuando se anula una liquidación y se pide revertir la caja. */
export function etiquetaAnulacionLiquidacion(codigo: string, persona: string): string {
  return `Anulación de liquidación ${codigo} · ${persona}`.replace(/\s+/g, " ").trim();
}
