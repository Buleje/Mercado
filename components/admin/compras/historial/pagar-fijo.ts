/**
 * pagar-fijo — registrar el pago de un gasto fijo (alquiler, luz, internet…)
 * desde cualquier pantalla: el panel del Historial y el Punto de compra.
 *
 * `POST /api/expenses/from-template/[id]` ya aceptaba «sale de la caja» y el
 * medio de pago del día, pero ninguna pantalla lo mandaba: pagar la luz con la
 * plata del cajón dejaba el arqueo esperando esos soles. Un solo lugar arma el
 * pedido y traduce la respuesta (`caja.sinCaja`) a un aviso en palabras.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import type { ExpensePaymentMethod } from "@/lib/expense-meta";

export type PagoDeFijo = {
  fechaIso: string;
  monto: number;
  /** Con qué se pagó hoy; `null` = como dice el gasto fijo. */
  paymentMethod: ExpensePaymentMethod | null;
  /** Contrato «sale de la caja»: sólo con efectivo (el servidor da 400 si no). */
  salidaDeCaja: boolean;
};

export type ResultadoPagoFijo =
  | { ok: true; aviso: string | null; tono: "ok" | "aviso" }
  | { ok: false; error: string };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export async function pagarGastoFijo(
  id: string,
  pago: PagoDeFijo,
  metodoDeLaPlantilla?: string | null,
): Promise<ResultadoPagoFijo> {
  const salidaDeCaja = pago.salidaDeCaja && pago.paymentMethod === "efectivo";
  const cuerpo: Record<string, unknown> = { date: pago.fechaIso, amount: pago.monto };
  // El medio sólo viaja si cambia o si sale de la caja: así, sin tocar nada,
  // el pago sigue el camino de siempre (`addFromTemplate`).
  if (pago.paymentMethod && (salidaDeCaja || pago.paymentMethod !== (metodoDeLaPlantilla ?? null))) {
    cuerpo.paymentMethod = pago.paymentMethod;
  }
  if (salidaDeCaja) cuerpo.salidaDeCaja = true;

  try {
    const res = await fetch(`/api/expenses/from-template/${id}`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(cuerpo),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; caja?: { sinCaja?: boolean } };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo registrar el pago. Intenta de nuevo." };
    if (salidaDeCaja && data.caja?.sinCaja) {
      return { ok: true, tono: "aviso", aviso: `Pago de ${soles(pago.monto)} registrado, pero no había caja abierta: no salió de ninguna caja.` };
    }
    if (salidaDeCaja) return { ok: true, tono: "ok", aviso: `Pago de ${soles(pago.monto)} registrado; salió de la caja abierta.` };
    return { ok: true, tono: "ok", aviso: null };
  } catch (err) {
    console.warn("[pagar-fijo] falló", err);
    return { ok: false, error: "No se pudo registrar el pago. Revisa tu conexión e intenta de nuevo." };
  }
}
