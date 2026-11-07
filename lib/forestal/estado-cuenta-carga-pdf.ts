/**
 * El PDF de UNA hoja del estado de cuenta de una carga (ver
 * `estado-cuenta-carga.ts`). Mismo membrete que los demás papeles del panel
 * (`abrirPapel`) y el orden del que se armó a mano para Rivers:
 *
 *   1. Madera de esta carga  (tipo · piezas · pies · precio · importe)
 *   2. Cuenta                (− adelantos, = saldo, + otros)
 *   TOTAL QUE DEBE <cliente> en una franja de color, con el monto en letras.
 *
 * Sólo en el navegador (jsPDF se carga en demanda dentro de `abrirPapel`).
 * El signo de resta va como «-»: la Helvetica de jsPDF no trae el «−» y lo
 * pintaba como comillas.
 */
import { dibujarPies, fechaDelDocumento, PALETA, type Rgb } from "@/lib/documentos/membrete-pdf";
import { pies3, soles, type EstadoCuentaCarga, type LineaCuenta } from "./estado-cuenta-carga";

export interface CabeceraEstadoCuenta {
  cliente: string;
  /** «RIV-20261029 (29/10/2026) + corta (03/11/2026)»: qué carga es. */
  carga: string;
  /** Fecha del papel (YYYY-MM-DD). */
  fecha: string;
}

const ROJO: Rgb = [180, 35, 24];

type Fila = [string, string, string];

function filasDeCuenta(e: EstadoCuentaCarga, cliente: string): { filas: Fila[]; notas: Map<number, string>; rojas: Set<number>; fuertes: Set<number> } {
  const filas: Fila[] = [["", "Importe de esta carga", soles(e.importeCarga)]];
  const notas = new Map<number, string>();
  const rojas = new Set<number>();
  const fuertes = new Set<number>();
  const poner = (signo: string, l: LineaCuenta, roja = false) => {
    if (l.nota) notas.set(filas.length, l.nota);
    if (roja) rojas.add(filas.length);
    filas.push([signo, l.concepto, soles(l.monto)]);
  };
  for (const l of e.adelantos) poner("-", { ...l, concepto: l.concepto || `Adelantos que dio ${cliente}` }, true);
  if (e.adelantos.length > 0) {
    fuertes.add(filas.length);
    filas.push(["=", "Saldo de esta carga", soles(e.saldoCarga)]);
  }
  /* Un saldo a favor del cliente llega como cargo negativo: se resta, en rojo. */
  for (const l of e.cargos) poner(l.monto < 0 ? "-" : "+", l, l.monto < 0);
  return { filas, notas, rojas, fuertes };
}

/** El nombre del archivo: «estado-de-cuenta-Don-Rivers-2026-11-03.pdf». */
export function nombreDelArchivo(cab: CabeceraEstadoCuenta): string {
  const nombre = cab.cliente.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `estado-de-cuenta-${nombre || "cliente"}-${cab.fecha}.pdf`;
}

/** Lo baja (por defecto) o lo devuelve como archivo para compartirlo por WhatsApp. */
export async function descargarEstadoCuentaCarga(e: EstadoCuentaCarga, cab: CabeceraEstadoCuenta): Promise<void>;
export async function descargarEstadoCuentaCarga(e: EstadoCuentaCarga, cab: CabeceraEstadoCuenta, o: { comoArchivo: true }): Promise<Blob>;
export async function descargarEstadoCuentaCarga(e: EstadoCuentaCarga, cab: CabeceraEstadoCuenta, o?: { comoArchivo: true }): Promise<Blob | void> {
  const { abrirPapel } = await import("@/lib/documentos/membrete-papel");
  const papel = await abrirPapel({ tipo: "Estado de cuenta", fecha: fechaDelDocumento(cab.fecha) });
  const { doc, margen, ancho } = papel;
  const acento = papel.mb.acento;
  const suave: Rgb = [
    Math.round(255 - (255 - acento[0]) * 0.1),
    Math.round(255 - (255 - acento[1]) * 0.1),
    Math.round(255 - (255 - acento[2]) * 0.1),
  ];

  /* Cliente y carga, en una franja suave. */
  doc.setFillColor(...suave);
  doc.roundedRect(margen, papel.y, ancho, 10, 1.5, 1.5, "F");
  doc.setFontSize(10.5);
  doc.setTextColor(...PALETA.tinta);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", margen + 3, papel.y + 6.4);
  doc.setFont("helvetica", "normal");
  doc.text(cab.cliente, margen + 19, papel.y + 6.4);
  if (cab.carga) {
    const txt = `Carga: ${cab.carga}`;
    doc.text(doc.splitTextToSize(txt, ancho * 0.55)[0] as string, margen + ancho - 3, papel.y + 6.4, { align: "right" });
  }
  papel.y += 17;

  /* 1. La madera. */
  papel.linea("1. Madera de esta carga", { tam: 12, negrita: true, color: acento, alto: 3 });
  papel.tabla({
    head: [["Tipo", "Piezas", "Pies tablares", "Precio por pie", "Importe"]],
    body: e.filas.map((f) => [f.tipo, f.piezas.toLocaleString("en-US"), pies3(f.pies), f.precio > 0 ? soles(f.precio) : "—", soles(f.importe)]),
    foot: [["Total de la carga", e.piezas.toLocaleString("en-US"), pies3(e.pies), "", soles(e.importeCarga)]],
    styles: { fontSize: 10, cellPadding: 2.4 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    headStyles: { halign: "right" },
    didParseCell: (d) => {
      if (d.column.index === 0 && d.section === "head") d.cell.styles.halign = "left";
      if (d.section === "foot") { d.cell.styles.fillColor = [...suave]; if (d.column.index > 0) d.cell.styles.halign = "right"; }
    },
  });

  /* 2. La cuenta. */
  papel.y += 2;
  papel.linea("2. Cuenta", { tam: 12, negrita: true, color: acento, alto: 3 });
  const { filas, notas, rojas, fuertes } = filasDeCuenta(e, cab.cliente);
  papel.tabla({
    body: filas.map(([s, t, m], i) => [s, notas.has(i) ? `${t}\n${notas.get(i)}` : t, m]),
    theme: "plain",
    styles: { fontSize: 11, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, lineColor: [...PALETA.regla], lineWidth: { bottom: 0.2 } },
    columnStyles: { 0: { cellWidth: 9, halign: "center", fontStyle: "bold", fontSize: 13 }, 2: { halign: "right", fontStyle: "bold", cellWidth: 42 } },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    didParseCell: (d) => {
      if (rojas.has(d.row.index) && d.column.index !== 1) d.cell.styles.textColor = [...ROJO];
      if (fuertes.has(d.row.index) && d.column.index === 1) d.cell.styles.fontStyle = "bold";
    },
    didDrawCell: (d) => {
      /* La nota va chica y gris debajo del concepto: autotable no tiene estilo por renglón, se repinta. */
      const nota = notas.get(d.row.index);
      if (d.section !== "body" || d.column.index !== 1 || !nota) return;
      const alto = d.cell.height;
      doc.setFillColor(255, 255, 255);
      doc.rect(d.cell.x + 0.5, d.cell.y + alto / 2, d.cell.width - 1, alto / 2 - 0.4, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PALETA.terciario);
      doc.text(nota, d.cell.x + 2, d.cell.y + alto - 3);
    },
  });

  /* El total, en la franja de color. */
  const debe = e.total >= 0;
  const quien = debe ? `TOTAL QUE DEBE ${cab.cliente.toUpperCase()}` : `SALDO A FAVOR DE ${cab.cliente.toUpperCase()}`;
  const yT = papel.y;
  doc.setFillColor(...acento);
  doc.roundedRect(margen, yT, ancho, 22, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(doc.splitTextToSize(quien, ancho - 70)[0] as string, margen + 5, yT + 9.5);
  doc.setFontSize(19);
  doc.text(soles(e.total), margen + ancho - 5, yT + 10.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Son: ${e.enLetras}`, margen + 5, yT + 17.5);
  papel.y = yT + 28;

  if (o?.comoArchivo) {
    dibujarPies(doc, papel.mb);
    return doc.output("blob");
  }
  papel.cerrar(nombreDelArchivo(cab));
}
