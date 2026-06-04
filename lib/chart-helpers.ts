export function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatSolesShort(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}

// ── Costo y margen REALES · fuente única (unificación 2026-06-04) ─────────────
// Regla canónica (audit P1 2026-05-16, originalmente solo en el Resumen):
// NUNCA fabricar costo con `price * 0.7`. Eso inflaba márgenes/valor ~30% y hacía
// que el Resumen y las sub-tabs (Ventas/Caja/Inventario/Productos) mostraran
// números DISTINTOS para el mismo negocio. Acá vive la única implementación:
// el costo es `costPrice` REAL o nada. Los ítems sin costo cargado cuentan a
// ingresos/unidades pero NO a costo/margen, y se marca la incompletitud para
// que el dueño cargue costos y vea un margen REAL.

/** Costo unitario REAL del producto (`costPrice`). `null` si no está cargado. */
export function realUnitCost(p: { costPrice?: number | null } | undefined | null): number | null {
  return p?.costPrice != null ? p.costPrice : null;
}

/** Lookup de costo real por id de producto (para agregaciones por línea de venta). */
export function buildCostLookup(
  products: ReadonlyArray<{ id: string | number; costPrice?: number | null }>,
): (id: string | number) => number | null {
  const m = new Map<string | number, number | null>(products.map((p) => [p.id, realUnitCost(p)]));
  return (id) => (m.has(id) ? m.get(id)! : null);
}

/**
 * Valor del inventario a COSTO REAL — solo productos con `costPrice` cargado.
 * Devuelve el valor + cuántos productos activos con stock quedaron sin costo
 * (para surfacing de "datos incompletos", no para inflar el número).
 */
export function inventoryValueAtCost(
  products: ReadonlyArray<{ active?: boolean; stock?: number | null; costPrice?: number | null }>,
): { valor: number; sinCosto: number } {
  let valor = 0;
  let sinCosto = 0;
  for (const p of products) {
    if (p.active === false) continue;
    const stock = p.stock ?? 0;
    const c = realUnitCost(p);
    if (c != null) valor += stock * c;
    else if (stock > 0) sinCosto += 1;
  }
  return { valor, sinCosto };
}

export interface MarginAgg {
  /** Ingresos totales de las líneas (todas). */
  ingresos: number;
  /** Ingresos de las líneas con costo real cargado. */
  ingresosConCosto: number;
  /** Costo real de esas líneas. */
  costo: number;
  /** Utilidad bruta REAL = ingresosConCosto − costo. */
  utilidadBruta: number;
  /** Margen % sobre lo MEDIBLE (utilidadBruta / ingresosConCosto). `null` si no hay base. */
  margenPct: number | null;
  /** true si hay ingresos sin costo cargado (margen no representa el total). */
  incompleto: boolean;
  /** % de ingresos con costo cargado (100 = todo medible). */
  coberturaPct: number;
}

/**
 * Agrega margen REAL sobre líneas `{ productId, quantity, price }` con un lookup
 * de costo real. El margen se calcula SOLO sobre los ítems con costo cargado,
 * así que `margenPct` es el margen verdadero de lo medible — no un promedio
 * diluido por ítems sin costo. Usar `buildCostLookup` para el `cost`.
 */
export function aggregateMargin(
  lines: Iterable<{ productId: string | number; quantity: number; price: number }>,
  cost: (id: string | number) => number | null,
): MarginAgg {
  let ingresos = 0;
  let ingresosConCosto = 0;
  let costo = 0;
  for (const l of lines) {
    const rev = l.price * l.quantity;
    ingresos += rev;
    const c = cost(l.productId);
    if (c != null) {
      ingresosConCosto += rev;
      costo += c * l.quantity;
    }
  }
  const utilidadBruta = ingresosConCosto - costo;
  return {
    ingresos,
    ingresosConCosto,
    costo,
    utilidadBruta,
    margenPct: ingresosConCosto > 0 ? (utilidadBruta / ingresosConCosto) * 100 : null,
    incompleto: ingresos - ingresosConCosto > 0.001,
    coberturaPct: ingresos > 0 ? (ingresosConCosto / ingresos) * 100 : 100,
  };
}
