/**
 * lib/rrhh/asistencia-semanal-pdf.ts — la hoja de asistencia semanal en PDF,
 * con una columna para la firma de cada trabajador (ADR-416).
 *
 * Mismo camino que el estado de cuenta de Adelantos: jsPDF + jspdf-autotable
 * cargados en demanda. No calcula nada: recibe las filas ya armadas por la
 * pantalla, y lo ganado viene de `calcularGanado` por la API. Así el papel que
 * firma la persona y la pantalla no pueden dar distinto.
 *
 * IO (descarga un archivo), sin React, fetch ni Prisma.
 */

import { STORE_TIMEZONE } from "@/lib/utils";
import type { LogoPdf } from "@/lib/admin/membrete";

export interface FilaHojaSemanalPdf {
  nombre: string;
  /** Ya con el tipo: «DNI 71234567». */
  documento: string | null;
  puesto: string | null;
  /** Lunes a domingo: la letra del estado, `""` sin marcar, `"—"` si ese día no le tocaba. */
  dias: string[];
  /** Sólo con plata: lo ganado de cada día; `null` = no entra. */
  importes?: (number | null)[];
  diasTrabajados: number;
  faltas: number;
  permisos: number;
  /** Sólo con plata: «S/ 350.00 por semana». */
  referencia?: string;
  /** Sólo con plata: lo ganado de la semana; `null` = sin calcular. */
  ganado?: number | null;
}

export interface DatosHojaSemanalPdf {
  negocio?: string | null;
  /** «14 al 20 de setiembre de 2026». */
  semana: string;
  /** «Lun 14» … «Dom 20». */
  encabezadosDias: string[];
  filas: FilaHojaSemanalPdf[];
  /** Columnas de plata (sólo nivel completo). */
  conPlata: boolean;
  total?: number | null;
  /** Líneas al pie de cada página: la leyenda y, con plata, la aclaración de referencia. */
  notas: string[];
  /** Logo del negocio listo para jsPDF; sin logo, el encabezado va con el nombre solo. */
  logo?: LogoPdf | null;
  /** Nombre del archivo, sin `.pdf`. */
  archivo: string;
}

const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidad = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
/** #007F7F — el turquesa de marca que pasa AA con texto blanco. */
const TURQUESA: [number, number, number] = [0, 127, 127];

export async function descargarHojaSemanal(d: DatosHojaSemanalPdf): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 10;

  // Hoy en Lima: en UTC, un PDF sacado a las 20:00 salía emitido «mañana».
  const emitido = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: STORE_TIMEZONE });
  // Con logo, el encabezado se corre a su derecha (alto 14 mm, ancho según su proporción, hasta 36 mm).
  let izquierda = margen;
  if (d.logo) {
    const altoLogo = 14;
    const anchoLogo = Math.min(36, (d.logo.ancho / d.logo.alto) * altoLogo);
    doc.addImage(d.logo.dataUrl, "PNG", margen, 9, anchoLogo, altoLogo);
    izquierda = margen + anchoLogo + 4;
  }
  doc.setTextColor(90);
  doc.setFontSize(9);
  if (d.negocio) doc.text(d.negocio.toUpperCase(), izquierda, 12);
  doc.text(`Emitido el ${emitido}`, ancho - margen, 12, { align: "right" });
  doc.setTextColor(20);
  doc.setFontSize(15);
  doc.text("Hoja de asistencia semanal", izquierda, 20);
  doc.setFontSize(10);
  doc.text(`Semana del ${d.semana}`, izquierda, 26);

  // Anchos en mm: la tabla entra en los 277 mm útiles de un A4 apaisado.
  const anchoDia = d.conPlata ? 13 : 15;
  const c = d.conPlata
    ? { trabajador: 40, puesto: 22, referencia: 24, ganado: 19, firma: 38 }
    : { trabajador: 48, puesto: 28, referencia: 0, ganado: 0, firma: 54 };
  const estiloDia = { cellWidth: anchoDia, halign: "center" as const };

  const head = [
    "N°",
    "Trabajador",
    "Puesto",
    ...d.encabezadosDias,
    "Días trab.",
    "Faltas",
    "Perm.",
    ...(d.conPlata ? ["Referencia", "Ganado"] : []),
    "Firma",
  ];

  const body = d.filas.map((f, i) => [
    String(i + 1),
    f.documento ? `${f.nombre}\n${f.documento}` : f.nombre,
    f.puesto ?? "",
    ...f.dias.map((letra, k) => {
      const importe = f.importes?.[k];
      return importe != null ? `${letra || "·"}\n${soles(importe)}` : letra || "·";
    }),
    cantidad(f.diasTrabajados),
    String(f.faltas),
    String(f.permisos),
    ...(d.conPlata ? [f.referencia ?? "—", f.ganado != null ? `S/ ${soles(f.ganado)}` : "—"] : []),
    "",
  ]);

  const foot = d.conPlata
    ? [
        [
          "",
          "Total",
          "",
          ...d.encabezadosDias.map(() => ""),
          cantidad(d.filas.reduce((a, f) => a + f.diasTrabajados, 0)),
          String(d.filas.reduce((a, f) => a + f.faltas, 0)),
          String(d.filas.reduce((a, f) => a + f.permisos, 0)),
          "",
          d.total != null ? `S/ ${soles(d.total)}` : "—",
          "",
        ],
      ]
    : undefined;

  autoTable(doc, {
    startY: 31,
    margin: { left: margen, right: margen, bottom: 18 },
    head: [head],
    body,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.4, valign: "middle", textColor: 20, lineColor: [205, 205, 205], lineWidth: 0.2, overflow: "linebreak" },
    headStyles: { fillColor: TURQUESA, textColor: 255, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: [242, 242, 242], textColor: 20, fontStyle: "bold" },
    // Alto de fila suficiente para firmar.
    bodyStyles: { minCellHeight: 13 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: c.trabajador },
      2: { cellWidth: c.puesto },
      3: estiloDia,
      4: estiloDia,
      5: estiloDia,
      6: estiloDia,
      7: estiloDia,
      8: estiloDia,
      9: estiloDia,
      10: { cellWidth: 12, halign: "center" },
      11: { cellWidth: 11, halign: "center" },
      12: { cellWidth: 11, halign: "center" },
      ...(d.conPlata
        ? { 13: { cellWidth: c.referencia, halign: "right" as const }, 14: { cellWidth: c.ganado, halign: "right" as const }, 15: { cellWidth: c.firma } }
        : { 13: { cellWidth: c.firma } }),
    },
    didDrawPage: () => {
      doc.setFontSize(6.5);
      doc.setTextColor(110);
      d.notas.forEach((nota, k) => doc.text(nota, margen, alto - 12 + k * 3.4, { maxWidth: ancho - margen * 2 - 22 }));
      doc.text(`Página ${doc.getNumberOfPages()}`, ancho - margen, alto - 5, { align: "right" });
    },
  });

  // Firma del empleador debajo de la tabla, si entra en la última página.
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  if (finalY + 24 < alto - 18) {
    doc.setDrawColor(120);
    doc.line(ancho - margen - 70, finalY + 18, ancho - margen, finalY + 18);
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text("Firma y sello del empleador", ancho - margen - 35, finalY + 22, { align: "center" });
  }

  doc.save(`${d.archivo}.pdf`);
}
