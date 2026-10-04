/**
 * anexo04-resumen-papel-pdf — el PDF del «Resumen del papel» (A4 vertical):
 * una tabla por hoja del ANEXO N° 04, el resumen general y el control de
 * cuadre. Los números vienen de `resumenDelPapel` (lib pura); acá sólo se dibuja.
 * Client-only: jsPDF y autotable entran por import dinámico.
 */
import type { jsPDF } from "jspdf";
import type { CellHookData } from "jspdf-autotable";
import type { PiezaCubicada } from "./cubicacion";
import { construirAnexo04, fmtAnexo, type Anexo04Opts, type DatosAnexo04 } from "./anexo04-serfor";
import {
  resumenDelPapel, type FilaResumenPapel, type HojaResumenPapel, type ResumenPapel, type TotalResumenPapel,
} from "./anexo04-resumen-papel";

const VERDE: [number, number, number] = [0, 128, 96];
const GRIS: [number, number, number] = [90, 90, 90];
const ROJO: [number, number, number] = [185, 28, 28];
const MARGEN = 36;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 10/09» */
export const fechaCorta = (d: Date = new Date()): string =>
  `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Mismo formato del papel (coma decimal, sin separador de miles). */
const miles = (n: number, dec: number) => fmtAnexo(n, dec);

export const nombreResumenPapel = (datos: Pick<DatosAnexo04, "gtf">) =>
  `resumen-del-papel-anexo04${datos.gtf ? `-${datos.gtf.replace(/[^\w-]+/g, "")}` : ""}-${new Date().toISOString().slice(0, 10)}.pdf`;

const num = (n: number, unidad: "m3" | "piezas") => (unidad === "piezas" ? String(n) : fmtAnexo(n));

type Fila = (string)[];

function cuerpo(filas: readonly FilaResumenPapel[], r: ResumenPapel): Fila[] {
  return filas.map((f) => [
    f.tipo, f.especie, String(f.reg), String(f.piezas), fmtAnexo(f.m3),
    f.pt == null ? "—" : miles(f.pt, r.decimalesPt),
  ]);
}

/** La hoja con el detalle de cada columna y, si una especie × tipo ocupa varias, su subtotal. */
function cuerpoDeHoja(h: HojaResumenPapel, r: ResumenPapel): { filas: Fila[]; subtotales: Set<number> } {
  const filas: Fila[] = [];
  const subtotales = new Set<number>();
  const pt = (v: number | null) => (v == null ? "—" : miles(v, r.decimalesPt));
  for (const g of h.grupos) {
    for (const c of g.columnas) {
      filas.push([`Col. ${c.columna}${c.continuacion ? " (sigue)" : ""}`, c.tipo, c.especie, String(c.reg), String(c.piezas), fmtAnexo(c.m3), pt(c.pt)]);
    }
    if (g.columnas.length > 1) {
      subtotales.add(filas.length);
      const t = g.subtotal;
      filas.push(["", `Subtotal ${t.tipo}`, t.especie, String(t.reg), String(t.piezas), fmtAnexo(t.m3), pt(t.pt)]);
    }
  }
  return { filas, subtotales };
}

const pie = (rotulo: string, t: TotalResumenPapel, m3: number, r: ResumenPapel): Fila[] => [[
  rotulo, "", String(t.reg), String(t.piezas), fmtAnexo(m3), t.pt == null ? "—" : miles(t.pt, r.decimalesPt),
]];

/** Dibuja el resumen en un documento nuevo (sin guardarlo: lo usan las pruebas). */
export async function construirDocResumenPapel(
  rows: PiezaCubicada[], datos: DatosAnexo04, opts: Anexo04Opts = {}, extras: { subtitulo?: string } = {},
): Promise<{ doc: jsPDF; resumen: ResumenPapel }> {
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable").then((m) => m.default)]);
  const anexo = construirAnexo04(rows, datos, opts);
  const resumen = resumenDelPapel(anexo, rows);
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const colPt = resumen.ptDerivado ? "PT (del cubicado)" : "PT";
  const head = [["Tipo", "Especie", "Reg", "Piezas", "m³", colPt]];
  let y = MARGEN;

  /* Cabecera: empresa, N° de anexo, GTF y fecha. */
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(20);
  doc.text("Resumen del papel — ANEXO N° 04", MARGEN, y + 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
  y += 28;
  const lineas = [
    datos.empresa ? datos.empresa.toUpperCase() : "",
    extras.subtitulo ?? "",
    `Anexo N° ${datos.numero || "—"}   ·   GTF N° ${datos.gtf || "—"}   ·   ${fechaCorta()}`,
    `${resumen.hojas.length} hoja${resumen.hojas.length === 1 ? "" : "s"} del formato   ·   volumen del anexo ${fmtAnexo(resumen.totalImpresoM3)} m³`,
    resumen.ptDerivado
      ? "El anexo va en m³: el PT no está impreso en el papel, sale de las piezas del cubicado (por columna, redondeado una vez a 2 decimales; los subtotales suman sus columnas)."
      : "El anexo va en pie tablar: el PT es el que imprime el papel (suma de los subtotales).",
  ].filter(Boolean);
  for (const l of lineas) { doc.text(l, MARGEN, y, { maxWidth: ancho - 2 * MARGEN }); y += l.length > 110 ? 22 : 12; }
  y += 6;

  const estilos = {
    margin: { left: MARGEN, right: MARGEN, top: MARGEN, bottom: 40 },
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    headStyles: { fillColor: VERDE, textColor: 255 },
    footStyles: { fillColor: [226, 239, 217] as [number, number, number], textColor: 20, fontStyle: "bold" as const },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 130 }, 2: { halign: "right" as const, cellWidth: 50 }, 3: { halign: "right" as const, cellWidth: 60 }, 4: { halign: "right" as const, cellWidth: 70 }, 5: { halign: "right" as const } },
    didParseCell: (d: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
      if ((d.section === "head" || d.section === "foot") && d.column.index >= 2) d.cell.styles.halign = "right";
    },
    showHead: "everyPage" as const,
    showFoot: "lastPage" as const,
  };
  const titulo = (txt: string) => {
    if (y > alto - 120) { doc.addPage(); y = MARGEN; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(txt, MARGEN, y); y += 6;
  };
  const tabla = (filas: Fila[], foot: Fila[]) => {
    autoTable(doc, { ...estilos, head, body: filas, foot, startY: y });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  };

  /* Las hojas llevan una columna más (en qué columna del papel está cada bloque). */
  const headHoja = [["Col.", "Tipo", "Especie", "Reg", "Piezas", "m³", colPt]];
  const columnasHoja = {
    0: { cellWidth: 58 }, 1: { cellWidth: 92 }, 2: { cellWidth: 110 },
    3: { halign: "right" as const, cellWidth: 42 }, 4: { halign: "right" as const, cellWidth: 52 },
    5: { halign: "right" as const, cellWidth: 62 }, 6: { halign: "right" as const },
  };
  for (const h of resumen.hojas) {
    titulo(`Hoja ${h.numero} de ${resumen.hojas.length}`);
    /* El total de la hoja es el que imprime el papel (3); si las filas no lo
       sostienen, el control de abajo dice cuánto falta. */
    const { filas, subtotales } = cuerpoDeHoja(h, resumen);
    const t = h.suma;
    autoTable(doc, {
      ...estilos,
      head: headHoja,
      body: filas,
      foot: [[`Total de la hoja ${h.numero}`, "", "", String(t.reg), String(t.piezas), fmtAnexo(h.totalImpresoM3), t.pt == null ? "—" : miles(t.pt, resumen.decimalesPt)]],
      columnStyles: columnasHoja,
      startY: y,
      didParseCell: (d: CellHookData) => {
        if ((d.section === "head" || d.section === "foot") && d.column.index >= 3) d.cell.styles.halign = "right";
        /* El subtotal de una especie × tipo partida en columnas, en negrita y sombreado. */
        if (d.section === "body" && subtotales.has(d.row.index)) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fillColor = [240, 244, 236];
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  titulo("Resumen general — tipo y especie de todo el anexo");
  tabla(cuerpo(resumen.general.filas, resumen), pie("Total del anexo", resumen.general.total, resumen.totalImpresoM3, resumen));

  titulo("Control de cuadre");
  autoTable(doc, {
    ...estilos, showFoot: "never", startY: y,
    head: [["Control", "Esperado", "Obtenido", "Resultado"]],
    body: resumen.controles.map((c) => [
      c.texto, num(c.esperado, c.unidad), num(c.obtenido, c.unidad), c.cuadra ? "Cuadra" : `NO cuadra: ${c.diferencia > 0 ? "+" : ""}${num(c.diferencia, c.unidad)}`,
    ]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "left" } },
    didParseCell: (d) => {
      if (d.section === "head" && (d.column.index === 1 || d.column.index === 2)) d.cell.styles.halign = "right";
      if (d.section === "body" && d.column.index === 3) {
        const ok = resumen.controles[d.row.index]?.cuadra;
        d.cell.styles.textColor = ok ? VERDE : ROJO;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  /* Pie con número de página en todas. */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(`Resumen del papel · Anexo N° ${datos.numero || "—"} · página ${i} de ${n}`, ancho / 2, alto - 20, { align: "center" });
  }
  return { doc, resumen };
}

/** Descarga el resumen del papel. */
export async function exportarResumenPapelPDF(rows: PiezaCubicada[], datos: DatosAnexo04, opts: Anexo04Opts = {}, extras: { subtitulo?: string } = {}): Promise<ResumenPapel> {
  const { doc, resumen } = await construirDocResumenPapel(rows, datos, opts, extras);
  doc.save(nombreResumenPapel(datos));
  return resumen;
}
