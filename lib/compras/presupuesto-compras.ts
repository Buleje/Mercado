/**
 * Presupuesto de compras del mes (N02, noche 17-10) sin schema nuevo.
 *
 * El techo vive en `ExpenseBudget` (el mismo de Mi Plata › Gastos y
 * presupuesto) con una categoría reservada:
 *   · «compras:total»            → lo que piensas comprar en todo el mes;
 *   · «compras:prov:<supplierId>» → lo que piensas comprarle a un proveedor.
 * Mi Plata no las cuenta como gasto (`esCategoriaDeCompras`): una compra no es
 * plata gastada hasta que se paga, y sumarlas allá duplicaría el techo.
 *
 * Lo comprado sale de las órdenes CREADAS en el mes (hora de Lima): recibidas
 * y por recibir (pendientes o parciales, que todavía esperan mercadería). Las
 * canceladas y las automáticas sin aprobar no comprometen plata y no cuentan.
 */

export const PREFIJO_PRESUPUESTO_COMPRAS = "compras:";
export const CATEGORIA_COMPRAS_TOTAL = "compras:total";
const PREFIJO_PROVEEDOR = "compras:prov:";

export const categoriaDeProveedor = (supplierId: string) => `${PREFIJO_PROVEEDOR}${supplierId}`;
export const esCategoriaDeCompras = (category: string) => category.startsWith(PREFIJO_PRESUPUESTO_COMPRAS);
export const proveedorDeCategoria = (category: string): string | null =>
  category.startsWith(PREFIJO_PROVEEDOR) ? category.slice(PREFIJO_PROVEEDOR.length) || null : null;

/** Estados que comprometen plata. */
export const ESTADOS_RECIBIDOS = ["recibido"] as const;
export const ESTADOS_POR_RECIBIR = ["pendiente", "parcial"] as const;

export type OrdenParaPresupuesto = { supplierId: string; supplierName: string; total: number; status: string };
export type TechoCompras = { category: string; montoMensual: number };

export type LineaPresupuestoCompras = {
  /** `null` = la línea del mes entero. */
  supplierId: string | null;
  nombre: string;
  recibido: number;
  porRecibir: number;
  /** recibido + por recibir: la plata comprometida. */
  comprado: number;
  /** Techo declarado. `null` = nadie fijó uno. */
  presupuesto: number | null;
  /** presupuesto − comprado. Negativo = te pasaste. `null` sin techo. */
  quedan: number | null;
  /** Porcentaje usado del techo (puede pasar de 100). `null` sin techo. */
  usadoPct: number | null;
};

export type PresupuestoCompras = {
  /** «2026-10» */
  mes: string;
  total: LineaPresupuestoCompras;
  proveedores: LineaPresupuestoCompras[];
  /** Hay al menos un techo de compras cargado. */
  hayPresupuesto: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Primer instante del mes de Lima (UTC−5, sin horario de verano) y del siguiente. */
export function mesDeLima(hoy: Date): { clave: string; desde: Date; hasta: Date } {
  const lima = new Date(hoy.getTime() - 5 * 3600_000);
  const y = lima.getUTCFullYear();
  const m = lima.getUTCMonth();
  return {
    clave: `${y}-${String(m + 1).padStart(2, "0")}`,
    desde: new Date(Date.UTC(y, m, 1, 5)),
    hasta: new Date(Date.UTC(y, m + 1, 1, 5)),
  };
}

function linea(
  supplierId: string | null,
  nombre: string,
  recibido: number,
  porRecibir: number,
  presupuesto: number | null,
): LineaPresupuestoCompras {
  const comprado = r2(recibido + porRecibir);
  const techo = presupuesto !== null && presupuesto > 0 ? r2(presupuesto) : null;
  return {
    supplierId,
    nombre,
    recibido: r2(recibido),
    porRecibir: r2(porRecibir),
    comprado,
    presupuesto: techo,
    quedan: techo === null ? null : r2(techo - comprado),
    usadoPct: techo === null ? null : Math.round((comprado / techo) * 1000) / 10,
  };
}

/**
 * Arma la comparación. `nombres` completa el nombre de un proveedor con techo
 * pero sin órdenes este mes (si no, saldría sin nombre).
 */
export function armarPresupuestoCompras(
  mes: string,
  ordenes: OrdenParaPresupuesto[],
  techos: TechoCompras[],
  nombres: Record<string, string> = {},
): PresupuestoCompras {
  const recibidos = new Set<string>(ESTADOS_RECIBIDOS);
  const porRecibir = new Set<string>(ESTADOS_POR_RECIBIR);
  const porProveedor = new Map<string, { nombre: string; recibido: number; porRecibir: number }>();
  let totRecibido = 0;
  let totPorRecibir = 0;

  for (const o of ordenes) {
    const esRecibida = recibidos.has(o.status);
    if (!esRecibida && !porRecibir.has(o.status)) continue;
    const monto = Number.isFinite(o.total) ? o.total : 0;
    const acc = porProveedor.get(o.supplierId) ?? { nombre: o.supplierName, recibido: 0, porRecibir: 0 };
    if (esRecibida) {
      acc.recibido += monto;
      totRecibido += monto;
    } else {
      acc.porRecibir += monto;
      totPorRecibir += monto;
    }
    porProveedor.set(o.supplierId, acc);
  }

  const techoProveedor = new Map<string, number>();
  let techoTotal: number | null = null;
  for (const t of techos) {
    if (t.category === CATEGORIA_COMPRAS_TOTAL) techoTotal = t.montoMensual;
    const id = proveedorDeCategoria(t.category);
    if (id) techoProveedor.set(id, t.montoMensual);
  }

  // Un proveedor con techo y sin órdenes en el mes también se ve: «te quedan» todo.
  for (const id of techoProveedor.keys()) {
    if (!porProveedor.has(id)) porProveedor.set(id, { nombre: nombres[id] ?? "Proveedor", recibido: 0, porRecibir: 0 });
  }

  const proveedores = [...porProveedor.entries()]
    .map(([id, a]) => linea(id, a.nombre, a.recibido, a.porRecibir, techoProveedor.get(id) ?? null))
    .sort((a, b) => b.comprado - a.comprado || a.nombre.localeCompare(b.nombre, "es"));

  return {
    mes,
    total: linea(null, "Todo el mes", totRecibido, totPorRecibir, techoTotal),
    proveedores,
    hayPresupuesto: (techoTotal ?? 0) > 0 || [...techoProveedor.values()].some((v) => v > 0),
  };
}
