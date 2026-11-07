/**
 * Totales de una cotización: UNA cuenta para el servidor (que es quien la
 * guarda, `POST /api/cotizaciones`) y para la vista previa del formulario.
 *
 * `Product.price` YA incluye IGV (es el mismo precio que cobra la caja; ver
 * `lib/precio-igv.ts` y `/api/sales`, que hace `extractIgv(total, tasa)`). Por
 * eso el monto de cada línea (`cantidad × precio × (1 − desc)`) es el TOTAL con
 * IGV: NO se le suma IGV encima. Se DESGLOSA: `base = total / (1 + tasa)`,
 * `igv = total − base`. Antes se sumaba `subtotal × 0,18` y una cotización de
 * S/ 111,20 (lo que cobra la caja) salía S/ 131,22 — doble IGV (18-10).
 *
 * El IGV va por línea según la afectación del producto (`Product.taxType`):
 * gravado desglosa IGV; exonerado o inafecto (Amazonía, Ley 27037) no lleva
 * (su total ES su base). Una línea escrita a mano (sin producto) va gravada,
 * como en el comprobante: ante la duda se paga IGV (`tasaDelProducto`).
 * La tasa sale de `lib/tax.ts` (o de `Settings.taxRate` vía `igvRateFromSettings`).
 */
import { extractIgv, IGV_RATE } from "@/lib/tax";
import { tasaDelProducto } from "@/lib/precio-igv";

export interface LineaParaTotales {
  /** Monto de la línea CON IGV incluido: `cantidad × precio × (1 − desc)`. */
  subtotal: number;
  /** `Product.taxType` de la línea; null/undefined = sin producto (gravado). */
  taxType?: string | null;
}

export interface TotalesCotizacion {
  /** Base imponible (sin IGV) sumando todas las líneas. */
  subtotal: number;
  /** IGV desglosado del total. */
  igv: number;
  /** Suma de los montos de línea (con IGV). `total = subtotal + igv`. */
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Base, IGV y total al céntimo, desglosando el IGV ya incluido en cada línea. */
export function totalesDeCotizacion(lineas: readonly LineaParaTotales[], tasaNegocio: number = IGV_RATE): TotalesCotizacion {
  let base = 0;
  let impuesto = 0;
  let totalConIgv = 0;
  for (const l of lineas) {
    const conIgv = Number.isFinite(l.subtotal) ? l.subtotal : 0;
    const tasa = tasaDelProducto(l.taxType, tasaNegocio);
    const { base: b, igv } = extractIgv(conIgv, tasa);
    base += b;
    impuesto += igv;
    totalConIgv += conIgv;
  }
  return { subtotal: r2(base), igv: r2(impuesto), total: r2(totalConIgv) };
}
