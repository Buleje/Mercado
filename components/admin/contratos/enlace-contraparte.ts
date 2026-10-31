import type { CosaDelPanel } from "@/lib/admin/enlaces-panel";

/** Con quién está atado el contrato (ADR-414: un contrato es con UNO de los tres). */
export interface ContraparteDelContrato {
  customerId?: string | null;
  supplierId?: string | null;
  colaboradorId?: string | null;
}

/**
 * A qué ficha lleva el nombre de la contraparte: el cliente (por teléfono, que
 * es su id en el CRM), el proveedor o el colaborador. Texto suelto (sin
 * vínculo) = `{}` y `EnlacePanel` lo deja como texto.
 */
export function enlaceDeContraparte(c: ContraparteDelContrato): { cosa?: CosaDelPanel; id?: string } {
  if (c.customerId) return { cosa: "cliente", id: c.customerId };
  if (c.supplierId) return { cosa: "proveedor", id: c.supplierId };
  if (c.colaboradorId) return { cosa: "colaborador", id: c.colaboradorId };
  return {};
}
