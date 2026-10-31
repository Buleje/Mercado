import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { moverCajaEnTx } from "@/lib/adelantos/movimiento-caja";
import { limaDateKey } from "@/lib/utils";

/**
 * «Sale de la caja» — un pago en EFECTIVO que sale del cajón abierto.
 *
 * El contrato (compartido por gastos y cuentas por pagar): el cuerpo trae
 * `salidaDeCaja?: boolean` (por defecto `false`), que sólo vale con método
 * efectivo; el servidor, en la MISMA transacción que guarda el gasto o el pago,
 * anota el egreso en la caja abierta y responde `caja: { sinCaja }`.
 *
 * Por qué hace falta: pagar el gas con la plata del cajón y anotarlo en Gastos
 * dejaba la caja con S/ X de más al arquear. La cajera lo descubría al cerrar
 * y nadie sabía por qué. Con esto la diferencia nace explicada.
 *
 * Reglas que heredan de `moverCajaEnTx` (adelantos, ADR-448):
 *  - **Sin caja abierta no bloquea.** El gasto se guarda igual y vuelve
 *    `sinCaja: true` para que la pantalla lo diga: perder el registro del gasto
 *    por no poder anotar en la caja sería el peor de los dos errores.
 *  - **La caja es el ÚLTIMO lock** de la transacción (`FOR SHARE`, pegado al
 *    commit). Si un cierre la tiene tomada, espera; si el cierre confirma
 *    primero, el egreso no entra en una caja cerrada (`sinCaja`).
 *
 * Las etiquetas empiezan con «Gasto ·» y «Pago a proveedor ·» porque así las
 * reconoce el origen del movimiento en la caja (`lib/caja/origen-movimiento.ts`)
 * y el historial de gastos las muestra como «la otra cara» del gasto, sin
 * sumarlas dos veces.
 */

/** Largo que se lee entero en una fila del arqueo. */
const LARGO_ETIQUETA = 160;

/** Mensaje para el 400 cuando piden salida de caja con otro medio. */
export const SOLO_EFECTIVO_SALE_DE_CAJA =
  "Sólo un pago en efectivo sale de la caja: con Yape, tarjeta o transferencia la plata no pasa por el cajón.";

/** Mensaje para el 400 cuando piden salida de caja con un gasto de otro día. */
export const SOLO_HOY_SALE_DE_CAJA =
  "Sólo un gasto de hoy sale de la caja abierta: uno de otro día ya no está en el cajón de hoy y descuadraría su arqueo.";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/**
 * ¿La fecha del gasto es HOY en Pucallpa? Sin fecha = hoy (el servidor pone
 * ahora). Una fecha sola («2026-10-09», la del formulario) se compara tal cual:
 * `new Date("2026-10-09")` es medianoche UTC = las 19:00 del día ANTERIOR en
 * Lima, y pasarla por `limaDateKey` la correría un día. Lo mismo con la
 * medianoche UTC exacta («2026-10-09T00:00:00.000Z»): es lo que deja
 * `new Date(input).toISOString()` en el cliente, no un instante real.
 */
export function esDeHoyEnLima(fecha: string | null | undefined, ahora: Date = new Date()): boolean {
  const texto = String(fecha ?? "").trim();
  if (!texto) return true;
  const soloDia = /^(\d{4}-\d{2}-\d{2})(T00:00(:00(\.0+)?)?Z)?$/.exec(texto);
  const dia = soloDia ? soloDia[1] : limaDateKey(texto);
  return dia === limaDateKey(ahora);
}

/** «jueves 09/10» — el día de Lima de un instante, con el día escrito a mano. */
export function diaDeCaja(instante: Date | string): string {
  const [y, m, d] = limaDateKey(instante).split("-").map(Number);
  if (!y || !m || !d) return "otro día";
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Id del retiro de caja de un gasto. Determinístico a propósito: va del gasto a
 * su retiro sin columna nueva (corregir el monto o borrar el gasto tiene que
 * poder encontrar el retiro). La devolución al borrar lleva el suyo.
 */
export function idRetiroDeGasto(gastoId: string): string {
  return `gasto-caja-${gastoId}`;
}

export function idDevolucionDeGasto(gastoId: string): string {
  return `gasto-caja-${gastoId}-devuelto`;
}

/** ¿Este pago saca plata del cajón? Sólo si lo pidieron Y es efectivo. */
export function saleDeCaja(pedido: boolean | null | undefined, metodo: string | null | undefined): boolean {
  return pedido === true && String(metodo ?? "").trim().toLowerCase() === "efectivo";
}

/** `true` si lo pidieron con un medio que no pasa por el cajón (→ 400). */
export function pedidoInvalido(pedido: boolean | null | undefined, metodo: string | null | undefined): boolean {
  return pedido === true && !saleDeCaja(pedido, metodo);
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > LARGO_ETIQUETA ? `${limpio.slice(0, LARGO_ETIQUETA - 1)}…` : limpio;
}

/** Cómo se lee en el arqueo el egreso de un gasto. */
export function etiquetaGasto(que: string | null | undefined): string {
  return recortar(`Gasto · ${String(que ?? "").trim() || "sin descripción"}`);
}

/** Cómo se lee en el arqueo la plata que vuelve al cajón al borrar un gasto. */
export function etiquetaGastoBorrado(que: string | null | undefined): string {
  return recortar(`Gasto borrado · ${String(que ?? "").trim() || "sin descripción"} (vuelve a la caja)`);
}

/** Cómo se lee en el arqueo el pago de una cuenta por pagar. */
export function etiquetaPagoAProveedor(proveedor: string | null | undefined, detalle?: string | null): string {
  const quien = String(proveedor ?? "").trim() || "sin nombre";
  const que = String(detalle ?? "").trim();
  return recortar(`Pago a proveedor · ${quien}${que ? ` · ${que}` : ""}`);
}

/** Anota el egreso EN EFECTIVO dentro de la transacción de quien llama. */
export async function egresoDeCajaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  opciones: { monto: number; etiqueta: string },
): Promise<{ sinCaja: boolean; movimientoId?: string }> {
  return moverCajaEnTx(tx, tenantId, {
    tipo: "egreso",
    monto: opciones.monto,
    metodo: "efectivo",
    etiqueta: opciones.etiqueta,
  });
}
