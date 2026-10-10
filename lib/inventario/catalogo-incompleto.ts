/**
 * Qué dato le falta a un producto del catálogo — la MISMA regla en el aviso de
 * Inicio («Completa tu catálogo», `OverviewDB.fetchOverview`, en SQL) y en el
 * filtro de Inventario que abre ese aviso (`?filter=sin-costo`, …).
 *
 * Por qué importa cada uno:
 *   · sin costo   → la ganancia de esa venta sale estimada (no se sabe cuánto
 *                   costó lo que se vendió);
 *   · sin código  → el lector de barras del punto de venta no lo encuentra;
 *   · sin mínimo  → «Bajo stock» usa 5 por defecto, que puede no ser lo tuyo.
 *
 * Los servicios no llevan stock ni código: no cuentan como incompletos.
 */

export const FALTAS_DE_CATALOGO = ["sin-costo", "sin-codigo", "sin-minimo", "incompleto"] as const;
export type FaltaDeCatalogo = (typeof FALTAS_DE_CATALOGO)[number];

export const ETIQUETA_FALTA: Record<FaltaDeCatalogo, string> = {
  "sin-costo": "Sin costo",
  "sin-codigo": "Sin código de barras",
  "sin-minimo": "Sin stock mínimo",
  incompleto: "Catálogo por completar",
};

export function esFaltaDeCatalogo(v: string | null | undefined): v is FaltaDeCatalogo {
  return (FALTAS_DE_CATALOGO as readonly string[]).includes(v ?? "");
}

export interface ProductoDelCatalogo {
  type?: string | null;
  /** Decimal: llega como número o como texto según la ruta. */
  costPrice?: number | string | null;
  barcode?: string | null;
  stock?: number | null;
  stockMin?: number | null;
}

const esServicio = (p: ProductoDelCatalogo) => p.type === "service";
const sinCosto = (p: ProductoDelCatalogo) => !(Number(p.costPrice ?? 0) > 0);
const sinCodigo = (p: ProductoDelCatalogo) => !(p.barcode ?? "").trim();
/** Sólo si lleva stock: un producto sin stock gestionado no tiene mínimo que poner. */
const sinMinimo = (p: ProductoDelCatalogo) => p.stock != null && p.stockMin == null;

/** ¿A `p` le falta el dato `falta`? `incompleto` = le falta cualquiera de los tres. */
export function leFalta(p: ProductoDelCatalogo, falta: FaltaDeCatalogo): boolean {
  if (esServicio(p)) return false;
  switch (falta) {
    case "sin-costo":
      return sinCosto(p);
    case "sin-codigo":
      return sinCodigo(p);
    case "sin-minimo":
      return sinMinimo(p);
    case "incompleto":
      return sinCosto(p) || sinCodigo(p) || sinMinimo(p);
  }
}
