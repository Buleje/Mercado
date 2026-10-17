/**
 * precio-comparable.ts — cuánto te cuesta de verdad un producto con cada
 * proveedor, en el mismo alcance (C37, noche 17-10).
 *
 * La tabla «Precio por producto» comparaba el `unitCost` de la última orden de
 * cada proveedor tal cual: contaba órdenes anuladas, mezclaba «saco» con
 * «kilo», ignoraba el descuento, el flete y si el costo venía sin IGV, y una
 * línea en S/ 0 salía como «Mejor precio». Acá cada fila es lo que pagaste
 * por UNA unidad puesta en tu tienda:
 *
 *   costo puesto = costo × (1 − descuento %) × (1,18 si se cargó sin IGV)
 *                  + flete y otros de la orden repartidos por valor (ADR-377)
 *
 * y «el mejor» sólo se elige entre filas de la MISMA unidad. El dato más
 * reciente que llegó (recibido o parcial) gana sobre una orden sólo pedida;
 * si nunca llegó, se muestra igual pero marcada.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { IGV_PERU } from "./totales-oc";
import { claveDeDia, diasEntre } from "./ciclo-oc";

/** Más de esto sin comprarle, el precio ya no dice cuánto cobra hoy. */
export const DIAS_PRECIO_VIEJO = 90;

export interface LineaDeCompra {
  supplierId: string;
  supplierName: string;
  ordenId: string;
  /** pendiente | recibido | parcial | cancelado | auto_generated */
  estado: string;
  creada: string;
  recibida: string | null;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  orden: {
    /** Suma de cantidad × costo de TODAS las líneas de la orden. */
    subtotal: number;
    /** Porcentaje 0-100. */
    descuentoPct: number;
    igvIncluido: boolean;
    flete: number;
    otros: number;
  };
}

export interface FilaComparable {
  supplierId: string;
  supplierName: string;
  unidad: string;
  /** Costo puesto de una unidad (con IGV, descuento y flete). */
  costoPuesto: number;
  /** El costo escrito en la orden, sin ajustes. */
  costoDeLista: number;
  /** De qué orden sale el dato. */
  ordenId: string;
  /** YYYY-MM-DD: el día que llegó o, si no llegó, el día que se pidió. */
  fecha: string;
  diasDesde: number;
  vieja: boolean;
  /** `true` si el dato sale de una orden que llegó; `false` = sólo pedida. */
  llego: boolean;
  /** Órdenes no anuladas con este producto en esta unidad. */
  compras: number;
  /** El más barato de su unidad (con costo > 0). */
  mejor: boolean;
  /** % sobre el más barato de su unidad; `null` si es el mejor o no hay con qué comparar. */
  sobreElMejor: number | null;
  /** Ajustes que separan el costo puesto del de lista, para el ⓘ. */
  ajustes: string[];

  // Nombres de antes (la tabla los leía así): mismo dato.
  lastPrice: number;
  lastDate: string;
  purchaseCount: number;
  isCheapest: boolean;
}

const LLEGO = new Set(["recibido", "parcial"]);

/** Unidad para agrupar: «Saco », «saco» y «SACO» son la misma. */
export function unidadNormalizada(u: string | null | undefined): string {
  return (u ?? "").trim().toLowerCase() || "und";
}

/** Costo de una unidad puesta en tu tienda, con lo que la orden cobró aparte. */
export function costoPuesto(l: Pick<LineaDeCompra, "costoUnitario" | "orden">): { costo: number; ajustes: string[] } {
  const ajustes: string[] = [];
  const d = Math.min(100, Math.max(0, l.orden.descuentoPct || 0));
  let base = l.costoUnitario * (1 - d / 100);
  if (d > 0) ajustes.push(`descuento ${d} %`);
  if (!l.orden.igvIncluido) {
    base *= 1 + IGV_PERU;
    ajustes.push("+ IGV (se cargó sin IGV)");
  }
  const sobrecostos = Math.max(0, (l.orden.flete || 0) + (l.orden.otros || 0));
  if (sobrecostos > 0 && l.orden.subtotal > 0) {
    // Reparto por valor (ADR-377): la parte del flete que le toca a una unidad.
    base += (sobrecostos * l.costoUnitario) / l.orden.subtotal;
    ajustes.push("+ flete y otros repartidos");
  }
  return { costo: Math.round(base * 100) / 100, ajustes };
}

/**
 * Una fila por proveedor y unidad. `hoy` en YYYY-MM-DD (Lima). Ordena por
 * unidad (la más comprada primero) y dentro, del más barato al más caro.
 */
export function compararPrecios(lineas: readonly LineaDeCompra[], hoy: string): FilaComparable[] {
  type Acum = { mejorDato: LineaDeCompra; fechaDato: string; compras: Set<string> };
  const grupos = new Map<string, Acum>();
  for (const l of lineas) {
    if (l.estado === "cancelado" || l.estado === "auto_generated") continue;
    const fecha = claveDeDia(LLEGO.has(l.estado) ? l.recibida ?? l.creada : l.creada);
    if (!fecha) continue;
    const k = `${l.supplierId}|${unidadNormalizada(l.unidad)}`;
    const g = grupos.get(k);
    if (!g) {
      grupos.set(k, { mejorDato: l, fechaDato: fecha, compras: new Set([l.ordenId]) });
      continue;
    }
    g.compras.add(l.ordenId);
    // Gana lo que llegó sobre lo sólo pedido; entre iguales, lo más reciente.
    const actualLlego = LLEGO.has(g.mejorDato.estado);
    const esteLlego = LLEGO.has(l.estado);
    if ((esteLlego && !actualLlego) || (esteLlego === actualLlego && fecha > g.fechaDato)) {
      g.mejorDato = l;
      g.fechaDato = fecha;
    }
  }

  const filas: Omit<FilaComparable, "mejor" | "sobreElMejor" | "isCheapest">[] = [];
  for (const g of grupos.values()) {
    const l = g.mejorDato;
    const { costo, ajustes } = costoPuesto(l);
    const diasDesde = Math.max(0, diasEntre(g.fechaDato, hoy));
    filas.push({
      supplierId: l.supplierId,
      supplierName: l.supplierName,
      unidad: unidadNormalizada(l.unidad),
      costoPuesto: costo,
      costoDeLista: Math.round(l.costoUnitario * 100) / 100,
      ordenId: l.ordenId,
      fecha: g.fechaDato,
      diasDesde,
      vieja: diasDesde > DIAS_PRECIO_VIEJO,
      llego: LLEGO.has(l.estado),
      compras: g.compras.size,
      ajustes,
      lastPrice: costo,
      lastDate: g.fechaDato,
      purchaseCount: g.compras.size,
    });
  }

  const minimoPorUnidad = new Map<string, number>();
  const comprasPorUnidad = new Map<string, number>();
  for (const f of filas) {
    comprasPorUnidad.set(f.unidad, (comprasPorUnidad.get(f.unidad) ?? 0) + f.compras);
    if (f.costoPuesto <= 0) continue;
    const m = minimoPorUnidad.get(f.unidad);
    if (m === undefined || f.costoPuesto < m) minimoPorUnidad.set(f.unidad, f.costoPuesto);
  }
  const conVarios = new Map<string, number>();
  for (const f of filas) if (f.costoPuesto > 0) conVarios.set(f.unidad, (conVarios.get(f.unidad) ?? 0) + 1);

  return filas
    .map((f) => {
      const min = minimoPorUnidad.get(f.unidad);
      const hayConQueComparar = (conVarios.get(f.unidad) ?? 0) > 1;
      const mejor = hayConQueComparar && min !== undefined && f.costoPuesto > 0 && f.costoPuesto === min;
      const sobreElMejor =
        hayConQueComparar && !mejor && min !== undefined && min > 0 && f.costoPuesto > 0
          ? Math.round(((f.costoPuesto - min) / min) * 100)
          : null;
      return { ...f, mejor, sobreElMejor, isCheapest: mejor };
    })
    .sort(
      (a, b) =>
        (comprasPorUnidad.get(b.unidad) ?? 0) - (comprasPorUnidad.get(a.unidad) ?? 0) ||
        a.unidad.localeCompare(b.unidad) ||
        (a.costoPuesto > 0 ? a.costoPuesto : Infinity) - (b.costoPuesto > 0 ? b.costoPuesto : Infinity),
    );
}
