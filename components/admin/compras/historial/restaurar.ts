/**
 * restaurar — volver a crear un gasto que se acaba de borrar.
 *
 * El DELETE devuelve el registro completo justamente para esto: restaurar con
 * los campos que la pantalla tenía a mano dejaba afuera, en silencio, el
 * documento, el IGV y de qué plantilla salía el pago — y ese último se nota,
 * porque sin `templateId` el gasto fijo vuelve a figurar como pendiente.
 *
 * `createdBy` NO se restaura: lo pone el servidor desde la sesión. Quien
 * deshace queda como quien lo cargó, y el ActivityLog guarda la secuencia real.
 *
 * LA CAJA AL DESHACER (decisión 09-10)
 *
 * Borrar un gasto que sacó efectivo de una caja ABIERTA le devuelve la plata
 * («Gasto borrado», `retiro: "devuelto"`). Deshacer ese borrado es decir «la
 * plata nunca volvió al cajón»: si el gasto se re-creaba sin más, el arqueo
 * quedaba esperando esos soles de más. Por eso se restaura con «sale de la
 * caja» y la caja vuelve a anotar el retiro. No se borra el «Gasto borrado»:
 * los tres renglones (retiro, devolución, retiro) cuentan lo que pasó y suman
 * lo mismo que el primero solo. Si la caja ya se cerró o el gasto no es de hoy,
 * el retiro no se puede volver a anotar: se restaura igual y se AVISA cuánto
 * quedó como devuelto, para que nadie lo descubra recién al cuadrar.
 * Con `retiro: "cerrada"` la caja no se tocó al borrar: tampoco al restaurar.
 */

import { csrfHeaders } from "@/lib/csrf-client";

/** Lo que devuelve el DELETE en `deleted` (un `DbExpense` serializado). */
export type GastoBorrado = {
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  frequency?: string | null;
  paymentDay?: number | null;
  paymentMethod?: string | null;
  supplierName?: string | null;
  supplierId?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  supplierRuc?: string | null;
  igvAmount?: number | null;
  afectoIgv?: boolean;
  attachmentUrl?: string | null;
  costCenter?: string | null;
  notes?: string | null;
  templateId?: string | null;
  paidAt?: string | null;
  /** Qué hizo el DELETE con la caja (no viene del registro: lo pega `borrarGasto`). */
  caja?: CajaDelBorrado | null;
};

/** `caja` del DELETE: `devuelto` = la plata volvió a la caja abierta. */
export type CajaDelBorrado = { retiro: "ajustado" | "devuelto" | "cerrada"; aviso: string };

/** Lo que pasó al restaurar; `aviso` = algo que la persona tiene que saber. */
export type Restaurado = { aviso: string | null; tono: "ok" | "aviso" };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** Quita los `null`/`undefined`: el POST valida y un `null` de más lo rechaza. */
function sinVacios(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

async function crear(cuerpo: Record<string, unknown>): Promise<Response> {
  return fetch("/api/expenses", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(sinVacios(cuerpo)),
  });
}

export async function restaurarGasto(g: GastoBorrado): Promise<Restaurado> {
  const cuerpo: Record<string, unknown> = {
    category: g.category,
    description: g.description,
    amount: g.amount,
    date: g.date,
    recurring: g.recurring,
    frequency: g.frequency,
    paymentDay: g.paymentDay,
    paymentMethod: g.paymentMethod,
    supplierName: g.supplierName,
    supplierId: g.supplierId,
    documentType: g.documentType,
    documentNumber: g.documentNumber,
    supplierRuc: g.supplierRuc,
    igvAmount: g.igvAmount,
    afectoIgv: g.afectoIgv,
    attachmentUrl: g.attachmentUrl,
    costCenter: g.costCenter,
    notes: g.notes,
    templateId: g.templateId,
    paidAt: g.paidAt,
  };
  if (g.caja?.retiro !== "devuelto") {
    const res = await crear(cuerpo);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { aviso: null, tono: "ok" };
  }

  const monto = soles(g.amount);
  const conCaja = await crear({ ...cuerpo, paymentMethod: "efectivo", salidaDeCaja: true });
  if (conCaja.ok) {
    const body = (await conCaja.json().catch(() => ({}))) as { caja?: { sinCaja?: boolean } };
    if (body.caja?.sinCaja) {
      return {
        tono: "aviso",
        aviso: `El gasto volvió, pero ya no hay caja abierta: los ${monto} quedaron como devueltos en la caja que se cerró. Si la plata no está en el cajón, corrígelo en esa caja.`,
      };
    }
    return { tono: "ok", aviso: `El gasto volvió y los ${monto} salieron otra vez de la caja abierta: el arqueo queda como antes de borrarlo.` };
  }
  // 400 = el gasto no es de hoy (sólo un gasto de hoy sale de la caja abierta).
  // Se restaura sin tocar la caja, que es mejor que no restaurar, y se avisa.
  if (conCaja.status !== 400) throw new Error(`HTTP ${conCaja.status}`);
  const sinCaja = await crear(cuerpo);
  if (!sinCaja.ok) throw new Error(`HTTP ${sinCaja.status}`);
  return {
    tono: "aviso",
    aviso: `El gasto volvió, pero los ${monto} siguen anotados como devueltos en la caja abierta («Gasto borrado»). Si la plata no volvió al cajón, anota un retiro de ${monto}.`,
  };
}

/** Borra y devuelve lo borrado, listo para restaurar. */
export async function borrarGasto(id: string): Promise<GastoBorrado> {
  const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", headers: csrfHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { deleted?: GastoBorrado; caja?: CajaDelBorrado };
  return { ...(data.deleted as GastoBorrado), caja: data.caja ?? null };
}
