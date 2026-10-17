/**
 * El estado de cuenta unificado (Adelantos + cuenta forestal), en PDF.
 *
 * Mismo camino que ya usa el módulo (`comprobante.ts`): jsPDF + jspdf-autotable
 * cargados en demanda, nunca un segundo motor de impresión por un documento
 * nuevo. A diferencia del PDF de sólo-Adelantos que arma `FichaPersonaModal`
 * (sin encabezado de negocio), éste lleva quién lo emite, a quién y cuándo —
 * es el papel que puede terminar mostrándose fuera del sistema.
 *
 * IO (descarga un archivo), pero sin React/fetch/Prisma: recibe los datos ya
 * armados por `estado-cuenta-unificado.ts` (puro) y sólo los dibuja.
 */

import { formatCurrency } from "@/lib/currency";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { formatearDia, type LineaEstadoCuenta, type TotalesEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import { STORE_TIMEZONE } from "@/lib/utils";

export interface DatosEstadoCuentaPdf {
  /** Nombre del negocio, para el encabezado — puede faltar si no está configurado. */
  negocio?: string | null;
  persona: string;
  documento?: string | null;
  lineas: LineaEstadoCuenta[];
  totales: TotalesEstadoCuenta;
}

const DIA_LARGO: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };

/** Arma y descarga el estado de cuenta. Carga jsPDF en demanda: pesa. */
export async function descargarEstadoDeCuenta(d: DatosEstadoCuentaPdf): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();

  doc.setFontSize(9);
  doc.text((d.negocio ?? "").toUpperCase(), 14, 14);
  doc.setFontSize(16);
  doc.text("Estado de cuenta", 14, 23);

  doc.setFontSize(11);
  doc.text(d.persona, 14, 31);
  let y = 31;
  if (d.documento) {
    y += 6;
    doc.setFontSize(9);
    doc.text(`Documento: ${d.documento}`, 14, y);
  }
  y += 6;
  doc.setFontSize(9);
  // Hoy en Lima: en UTC, un PDF sacado a las 20:00 salía emitido "mañana".
  doc.text(`Emitido el ${new Date().toLocaleDateString("es-PE", { ...DIA_LARGO, timeZone: STORE_TIMEZONE })}`, 14, y);

  autoTable(doc, {
    startY: y + 6,
    head: [["Fecha", "Concepto", "Referencia", "Monto", "Saldo"]],
    body: d.lineas.map((l) => [
      formatearDia(l.fecha, DIA_LARGO),
      l.concepto,
      l.referencia ?? "—",
      `${l.monto >= 0 ? "+" : "−"}${montoEnMoneda(Math.abs(l.monto), l.moneda)}`,
      montoEnMoneda(l.acumulado, l.moneda),
    ]),
    styles: { fontSize: 9 },
    // Las líneas son las que se explican a la persona: el total va SEPARADO
    // por pata (mismo criterio que la fila — mostrar el neto solo esconde
    // que una parte se le adelantó plata y por otra ella vendió madera).
    foot: [
      ["", "", "", "Adelantos", formatCurrency(d.totales.adelantos.saldo)],
      ["", "", "", "Cuenta forestal", formatCurrency(d.totales.forestal.saldo)],
      ["", "", "", "Neto", formatCurrency(d.totales.neto)],
    ],
  });

  const otras = Object.entries(d.totales.otrasMonedas).filter(([, v]) => v !== 0);
  if (otras.length) {
    // jspdf-autotable adjunta `lastAutoTable` al doc en runtime (mismo patrón
    // que el resto de los exports PDF del repo, p. ej. cubicador-export.ts).
    const finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 8;
    doc.setFontSize(9);
    doc.text(`Otras monedas (fuera del neto): ${otras.map(([m, v]) => montoEnMoneda(v, m)).join(" · ")}`, 14, finalY);
  }

  doc.setFontSize(7);
  doc.text("Documento de referencia — no reemplaza un comprobante SUNAT.", 14, doc.internal.pageSize.getHeight() - 10);

  doc.save(`estado-cuenta-${d.persona.trim().replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
