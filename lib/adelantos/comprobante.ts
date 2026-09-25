/**
 * El papel que firma la persona cuando recibe la plata.
 *
 * POR QUÉ. El módulo podía exportar el estado de cuenta (todo el historial), pero
 * no el comprobante de UN adelanto — que es el que se necesita en el momento del
 * desembolso, con la firma. Sin él, el respaldo del préstamo queda en un
 * cuaderno o en nada.
 *
 * Se apoya en el código de operación (ADR-329): el papel y el sistema dicen el
 * mismo número, así que cuando aparece un recibo suelto se puede encontrar de
 * qué adelanto es.
 *
 * jsPDF y no HTML imprimible: es el idioma que ya usa este módulo para el
 * estado de cuenta y la lista de cobranza — meter un segundo motor de impresión
 * por un documento sería dos formas de hacer lo mismo.
 */

import { formatCurrency } from "@/lib/currency";

export interface DatosComprobante {
  codigoOperacion?: string | null;
  reciboManual?: string | null;
  persona: string;
  documento?: string | null;
  telefono?: string | null;
  monto: number;
  moneda?: string | null;
  fecha: string;
  modalidad: string;
  notas?: string | null;
  /** Nombre del negocio, para encabezar el papel. */
  negocio?: string;
}

const MODALIDAD_LABEL: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente (se liquida con entregas)",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

/**
 * Monto en letras — lo que hace que un recibo no se pueda alterar con un cero.
 *
 * Cubre hasta 999.999, que es de sobra para un adelanto; arriba de eso devuelve
 * el número, que es mejor que mentir con una conversión a medias.
 */
export function montoEnLetras(n: number): string {
  /**
   * Se redondea a centavos ANTES de partir. Hacerlo al revés daba «noventa y
   * nueve con 100/100» para 99.999: los centavos redondeaban a 100 y nadie los
   * acarreaba a la unidad. En un papel firmado eso es un error que se nota.
   */
  const total = Math.round(Math.abs(n) * 100);
  const entero = Math.floor(total / 100);
  const centavos = total % 100;
  if (entero > 999_999) return `${entero}`;

  const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos"];

  const hasta999 = (x: number): string => {
    if (x === 0) return "";
    if (x === 100) return "cien";
    const c = Math.floor(x / 100);
    const d = x % 100;
    const resto =
      d < 20
        ? UNIDADES[d]
        : d % 10 === 0
          ? DECENAS[Math.floor(d / 10)]
          : Math.floor(d / 10) === 2
            ? `veinti${UNIDADES[d % 10]}`
            : `${DECENAS[Math.floor(d / 10)]} y ${UNIDADES[d % 10]}`;
    return [CENTENAS[c], resto].filter(Boolean).join(" ");
  };

  const miles = Math.floor(entero / 1000);
  const resto = entero % 1000;
  const parteMiles = miles === 0 ? "" : miles === 1 ? "mil" : `${hasta999(miles)} mil`;
  const texto = [parteMiles, hasta999(resto)].filter(Boolean).join(" ") || "cero";
  return `${texto} con ${String(centavos).padStart(2, "0")}/100`;
}

/** Arma y descarga el comprobante. Carga jsPDF en demanda: pesa. */
export async function descargarComprobante(d: DatosComprobante): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  // A5 apaisado: entra en media hoja A4, que es como se imprime en el mostrador.
  const doc = new jsPDF({ format: "a5", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFontSize(9);
  doc.text((d.negocio ?? "").toUpperCase(), 12, y);
  doc.setFontSize(15);
  doc.text("COMPROBANTE DE ADELANTO", 12, (y += 8));

  // El código, grande y a la derecha: es lo que se busca cuando aparece el papel.
  doc.setFontSize(13);
  doc.text(d.codigoOperacion ?? "—", W - 12, 22, { align: "right" });
  if (d.reciboManual) {
    doc.setFontSize(9);
    doc.text(`Recibo ${d.reciboManual}`, W - 12, 28, { align: "right" });
  }

  doc.setLineWidth(0.4);
  doc.line(12, (y += 4), W - 12, y);

  doc.setFontSize(10);
  const linea = (etiqueta: string, valor: string) => {
    y += 7;
    doc.text(`${etiqueta}:`, 12, y);
    doc.text(valor, 45, y);
  };
  linea("Fecha", fecha(d.fecha));
  linea("Recibí de", d.negocio ?? "—");
  linea("Nombre", d.persona);
  if (d.documento) linea("Documento", d.documento);
  linea("Modalidad", MODALIDAD_LABEL[d.modalidad] ?? d.modalidad);

  y += 9;
  doc.setFontSize(14);
  doc.text(`${formatCurrency(d.monto)}`, 12, y);
  doc.setFontSize(9);
  doc.text(`(${montoEnLetras(d.monto)} soles)`, 12, (y += 5));

  if (d.notas) {
    doc.setFontSize(9);
    doc.text(`Concepto: ${d.notas}`.slice(0, 110), 12, (y += 7));
  }

  // La declaración: sin esto el papel es un recibo, no un compromiso.
  y += 8;
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(
      "Declaro haber recibido el monto indicado y me comprometo a liquidarlo según la modalidad acordada.",
      W - 24,
    ) as string[],
    12,
    y,
  );

  // Dos firmas: quien entrega y quien recibe.
  const yFirma = doc.internal.pageSize.getHeight() - 22;
  doc.line(16, yFirma, 76, yFirma);
  doc.line(W - 76, yFirma, W - 16, yFirma);
  doc.setFontSize(8);
  doc.text("Entregó", 46, yFirma + 5, { align: "center" });
  doc.text("Recibí conforme", W - 46, yFirma + 5, { align: "center" });

  doc.save(`adelanto-${(d.codigoOperacion ?? "sin-codigo").toLowerCase()}.pdf`);
}
