/**
 * Borrador de reposición: qué hace el cron con la orden automática de UN
 * proveedor de UN negocio. Puro (sin base) para poder probarlo entero.
 *
 * Por qué existe (10-10): el cron creaba una orden nueva cada día aunque la de
 * ayer siguiera abierta (33 de 35 pendientes de `main` eran la misma: Atún ×40)
 * y le ponía un total (S/ 600) que sus líneas no sumaban (S/ 0). Ahora:
 *   · lo que ya está pedido en una orden abierta del mismo proveedor no se
 *     vuelve a pedir;
 *   · si hay un borrador automático (`auto_generated`), se le actualizan las
 *     cantidades y se le agregan las líneas que falten, en vez de crear otro;
 *   · el total es SIEMPRE la suma de las líneas (cantidad × costo).
 */

export type LineaSugerida = {
  productId: number;
  name: string;
  quantity: number;
  unitCost: number;
  unit: string;
};

export type OrdenAbierta = {
  id: string;
  status: string;
  items: Array<{ id: number; productId: number; quantity: number; unitCost: number }>;
};

export type PlanBorrador =
  | { accion: "nada"; razon: string; purchaseOrderId: string | null }
  | { accion: "crear"; lineas: LineaSugerida[]; total: number }
  | {
      accion: "actualizar";
      purchaseOrderId: string;
      cambios: Array<{ itemId: number; quantity: number; unitCost: number }>;
      nuevas: LineaSugerida[];
      total: number;
    };

/** Estados en los que una orden todavía va a traer mercadería. */
export const ESTADOS_ABIERTOS = ["auto_generated", "pendiente", "parcial"] as const;

/** Σ cantidad × costo, en céntimos exactos. */
export function totalDeLineas(lineas: ReadonlyArray<{ quantity: number; unitCost: number }>): number {
  const centimos = lineas.reduce((s, l) => s + Math.round(l.quantity * l.unitCost * 100), 0);
  return centimos / 100;
}

/**
 * @param abiertas órdenes abiertas del MISMO negocio y proveedor, la más
 *   reciente primero (el borrador que se reusa es el primero `auto_generated`).
 * @param sugeridas lo que el cron quiere pedir hoy (una línea por producto).
 */
export function planearBorradorDeReposicion({
  abiertas,
  sugeridas,
}: {
  abiertas: ReadonlyArray<OrdenAbierta>;
  sugeridas: ReadonlyArray<LineaSugerida>;
}): PlanBorrador {
  const borrador = abiertas.find((o) => o.status === "auto_generated") ?? null;
  // Lo pedido en otra orden abierta (manual, aprobada o a medio recibir) ya viene en camino.
  const cubiertos = new Set<number>();
  for (const o of abiertas) {
    if (o === borrador) continue;
    for (const i of o.items) cubiertos.add(i.productId);
  }
  const porPedir = sugeridas.filter((s) => !cubiertos.has(s.productId));

  if (!borrador) {
    if (porPedir.length === 0) {
      return { accion: "nada", razon: "ya pedido en una orden abierta", purchaseOrderId: abiertas[0]?.id ?? null };
    }
    return { accion: "crear", lineas: porPedir, total: totalDeLineas(porPedir) };
  }

  const enBorrador = new Map(borrador.items.map((i) => [i.productId, i]));
  const cambios: Array<{ itemId: number; quantity: number; unitCost: number }> = [];
  const nuevas: LineaSugerida[] = [];
  for (const s of porPedir) {
    const linea = enBorrador.get(s.productId);
    if (!linea) {
      nuevas.push(s);
    } else if (linea.quantity !== s.quantity || linea.unitCost !== s.unitCost) {
      cambios.push({ itemId: linea.id, quantity: s.quantity, unitCost: s.unitCost });
    }
  }
  if (cambios.length === 0 && nuevas.length === 0) {
    return { accion: "nada", razon: "el borrador ya pide esto", purchaseOrderId: borrador.id };
  }
  const cambioPorItem = new Map(cambios.map((c) => [c.itemId, c]));
  const finales = [
    ...borrador.items.map((i) => cambioPorItem.get(i.id) ?? i),
    ...nuevas,
  ];
  return { accion: "actualizar", purchaseOrderId: borrador.id, cambios, nuevas, total: totalDeLineas(finales) };
}
