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

export function lineasSinProducto(lineas: readonly LineaFacturaXml[], elegidos: Elegidos): number[] {
  return lineas.filter((l) => !elegidos[l.numero]).map((l) => l.numero);
}

export function cuerpoDeLaCompra(input: {
  factura: FacturaXml;
  supplierId: string;
  supplierName: string;
  formaDePago: FormaDePago;
  elegidos: Elegidos;
}) {
  const { factura } = input;
  return {
    // Mismo papel = misma llave: dos clics (o un reintento) no crean dos compras.
    idempotencyKey: `factura-xml:${factura.emisor.ruc}:${factura.serieNumero}`.slice(0, 100),
    supplierId: input.supplierId,
    supplierName: input.supplierName.slice(0, 200),
    invoiceNumber: factura.serieNumero.slice(0, 60),
    invoiceType: factura.tipo,
    igvIncluded: true,
    paymentMethod: input.formaDePago,
    notes: `Cargada desde la factura electrónica (XML) ${factura.serieNumero}`,
    items: factura.lineas.flatMap((l) => {
      const p = input.elegidos[l.numero];
      return p
        ? [{ productId: p.id, quantity: l.cantidad, unitCost: costoUnitarioDe(l), unit: (p.unidad || l.unidad).slice(0, 50), name: p.nombre.slice(0, 200) }]
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

export function monto(n: number, moneda: string): string {
  const cifra = n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === "PEN") return `S/ ${cifra}`;
  return moneda === "USD" ? `US$ ${cifra}` : `${moneda} ${cifra}`;
}
