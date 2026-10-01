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
};

/** Quita los `null`/`undefined`: el POST valida y un `null` de más lo rechaza. */
function sinVacios(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

export async function restaurarGasto(g: GastoBorrado): Promise<void> {
  const res = await fetch("/api/expenses", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(sinVacios({
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
    })),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Borra y devuelve lo borrado, listo para restaurar. */
export async function borrarGasto(id: string): Promise<GastoBorrado> {
  const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", headers: csrfHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return data.deleted as GastoBorrado;
}
