/**
 * De la vista previa de la factura XML al cuerpo de `POST /api/purchases`.
 * Puro. El total NO se calcula acá (regla 6): se manda cada línea con su
 * costo por unidad con impuestos y el servidor suma.
 */
import type { FacturaXml, LineaFacturaXml } from "@/lib/compras/factura-xml";
import type { MotivoCruce, ProductoSugerido as SugeridoXml, SugerenciaDeLinea } from "@/lib/compras/factura-xml-cruce";
import type { ProductoSugerido } from "@/lib/admin/comandos-ia/papel";

export type FormaDePago = "contado" | "credito_7" | "credito_15" | "credito_30" | "transferencia";
export type Elegidos = Record<number, ProductoSugerido | null>;

export const FORMAS_DE_PAGO: ReadonlyArray<{ valor: FormaDePago; etiqueta: string }> = [
  { valor: "contado", etiqueta: "Al contado" },
  { valor: "credito_7", etiqueta: "Crédito a 7 días" },
  { valor: "credito_15", etiqueta: "Crédito a 15 días" },
  { valor: "credito_30", etiqueta: "Crédito a 30 días" },
  { valor: "transferencia", etiqueta: "Transferencia" },
];

export const POR_QUE: Record<Exclude<MotivoCruce, null>, string> = {
  "codigo-barras": "Por el código de barras",
  "codigo-vendedor": "Por el código del proveedor",
  nombre: "Por el nombre: revísalo",
};

/** El selector de producto del panel (Lee un papel) usa otra forma: se adapta acá. */
export function aSelector(p: SugeridoXml, parecido = 1): ProductoSugerido {
  return { id: p.id, nombre: p.nombre, unidad: p.unidad, stock: null, costo: null, puntaje: parecido };
}

/** Viene puesta la sugerencia alta o media; sin sugerencia, la línea queda por elegir. */
export function productosIniciales(lineas: readonly SugerenciaDeLinea[]): Elegidos {
  return Object.fromEntries(lineas.map((l) => [l.numero, l.producto && l.confianza !== "ninguna" ? aSelector(l.producto) : null]));
}

export function alternativasDe(s: SugerenciaDeLinea): ProductoSugerido[] {
  const lista = [...(s.producto ? [aSelector(s.producto)] : []), ...s.alternativas.map((a) => aSelector(a, a.parecido))];
  return lista.filter((p, i) => lista.findIndex((q) => q.id === p.id) === i);
}

/** Lo que de verdad pagas por unidad (total de la línea con impuestos ÷ cantidad). Regalo = 0. */
export function costoUnitarioDe(l: LineaFacturaXml): number {
  if (l.gratuita || l.cantidad <= 0) return 0;
  return Math.round((l.total / l.cantidad) * 1e6) / 1e6;
}

export function formaDePagoSugerida(fecha: string, vence: string | null): FormaDePago {
  if (!vence) return "contado";
  const dias = Math.round((Date.parse(vence.slice(0, 10)) - Date.parse(fecha.slice(0, 10))) / 86_400_000);
  if (!Number.isFinite(dias) || dias <= 0) return "contado";
  if (dias <= 7) return "credito_7";
  if (dias <= 15) return "credito_15";
  return "credito_30";
}

/** Líneas que van a la compra y todavía no tienen producto (las quitadas no cuentan). */
export function lineasSinProducto(lineas: readonly LineaFacturaXml[], elegidos: Elegidos, quitadas: readonly number[] = []): number[] {
  return lineas.filter((l) => !quitadas.includes(l.numero) && !elegidos[l.numero]).map((l) => l.numero);
}

/** El tipo de cambio con el que se pasa a soles una factura en otra moneda. */
export interface CambioUsado {
  /** Soles por 1 unidad de la moneda. Compras: SUNAT usa el de VENTA. */
  venta: number;
  /** Fecha de emisión de la factura (AAAA-MM-DD). */
  fecha: string;
  fuente: "sunat" | "bcrp-sbs" | "manual";
  /** «SBS al cierre del 02-11 (BCRP)» cuando no es el texto de SUNAT del mismo día. */
  detalle: string | null;
}

/** Rango creíble (mismo que `lib/integrations/tipo-cambio.ts`): un 37.52 por 3.752 no pasa. */
export function tipoCambioValido(n: number, moneda = "USD"): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  return moneda === "USD" ? n >= 2.5 && n <= 5.5 : n <= 50;
}

/** Lo que el dueño escribe a mano («3,752» o «3.752») → número, o null si no sirve. */
export function leerTipoCambio(texto: string, moneda = "USD"): number | null {
  const limpio = texto.trim().replace(/^S\/\s*/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return tipoCambioValido(n, moneda) ? n : null;
}

/** Redondeo a céntimos. */
export function aCentimos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Total de la línea en soles = total de la línea (con IGV) × tipo de cambio,
 * redondeado a céntimos UNA sola vez por línea. Regalo = 0.
 */
export function totalLineaEnSoles(l: LineaFacturaXml, tc: number): number {
  if (l.gratuita || l.cantidad <= 0) return 0;
  return aCentimos(l.total * tc);
}

/**
 * Costo por unidad en soles = total de la línea en soles ÷ cantidad (6 decimales,
 * igual que `costoUnitarioDe`). Por qué no se redondea el costo por unidad a
 * céntimos: el servidor suma cantidad × costo, y 100 unidades con el costo
 * redondeado podían correrse hasta S/ 0.50. Así cada línea cierra con su total en
 * soles (±0.000001 × cantidad) y la compra suma Σ líneas en soles, que difiere de
 * «total del papel × tipo de cambio» en a lo más S/ 0.005 por línea (el redondeo
 * de cada una).
 */
export function costoUnitarioEnSoles(l: LineaFacturaXml, tc: number): number {
  if (l.gratuita || l.cantidad <= 0) return 0;
  return Math.round((totalLineaEnSoles(l, tc) / l.cantidad) * 1e6) / 1e6;
}

/** «Factura en US$ 1,234.56, tipo de cambio SUNAT venta 3.752 del 04/11/2026». */
export function notaDelCambio(factura: FacturaXml, cambio: CambioUsado): string {
  const tc = tipoCambioTexto(cambio.venta);
  const base = `Factura en ${monto(factura.totales.total, factura.moneda)}, tipo de cambio`;
  if (cambio.fuente === "manual") return `${base} venta ${tc} del ${fechaNumerica(cambio.fecha)}, escrito a mano`;
  const detalle = cambio.fuente === "bcrp-sbs" && cambio.detalle ? ` (${cambio.detalle})` : "";
  return `${base} SUNAT venta ${tc} del ${fechaNumerica(cambio.fecha)}${detalle}`;
}

/**
 * Factura en otra moneda: los costos van EN SOLES con el tipo de cambio y la
 * nota dice cuál se usó. Sin tipo de cambio válido no se arma (lanza el error que
 * ve el dueño): nunca se guarda en dólares como si fueran soles.
 */
export function cuerpoDeLaCompra(input: {
  factura: FacturaXml;
  supplierId: string;
  supplierName: string;
  formaDePago: FormaDePago;
  elegidos: Elegidos;
  cambio?: CambioUsado | null;
  /** Líneas que el dueño quitó antes de guardar. */
  quitadas?: readonly number[];
}) {
  const { factura } = input;
  const tc = factura.moneda === "PEN" ? null : (input.cambio?.venta ?? null);
  if (factura.moneda !== "PEN" && (tc === null || !tipoCambioValido(tc, factura.moneda))) {
    throw new Error(`Falta el tipo de cambio del ${factura.moneda === "USD" ? "dólar" : factura.moneda}: sin él la compra no se pasa a soles.`);
  }
  const quitadas = input.quitadas ?? [];
  const notas = [`Cargada desde la factura electrónica (XML) ${factura.serieNumero}`];
  if (tc !== null && input.cambio) notas.push(notaDelCambio(factura, input.cambio));
  if (quitadas.length > 0) {
    notas.push(`Sin ${quitadas.length === 1 ? "la línea" : "las líneas"} ${[...quitadas].sort((a, b) => a - b).join(", ")} de la factura`);
  }
  return {
    // Mismo papel = misma llave: dos clics (o un reintento) no crean dos compras.
    idempotencyKey: `factura-xml:${factura.emisor.ruc}:${factura.serieNumero}`.slice(0, 100),
    supplierId: input.supplierId,
    supplierName: input.supplierName.slice(0, 200),
    invoiceNumber: factura.serieNumero.slice(0, 60),
    invoiceType: factura.tipo,
    igvIncluded: true,
    paymentMethod: input.formaDePago,
    notes: notas.join(". ").slice(0, 1000),
    items: factura.lineas.flatMap((l) => {
      const p = quitadas.includes(l.numero) ? null : input.elegidos[l.numero];
      const unitCost = tc === null ? costoUnitarioDe(l) : costoUnitarioEnSoles(l, tc);
      return p
        ? [{ productId: p.id, quantity: l.cantidad, unitCost, unit: (p.unidad || l.unidad).slice(0, 50), name: p.nombre.slice(0, 200) }]
        : [];
    }),
  };
}

/** «jueves 10/09». */
export function fechaConDia(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = d.toLocaleDateString("es-PE", { weekday: "long" });
  return `${dia} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** «04/11/2026». */
export function fechaNumerica(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** «3.752» (SUNAT publica 3 decimales). */
export function tipoCambioTexto(tc: number): string {
  return tc.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

export function monto(n: number, moneda: string): string {
  const cifra = n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === "PEN") return `S/ ${cifra}`;
  return moneda === "USD" ? `US$ ${cifra}` : `${moneda} ${cifra}`;
}
