/**
 * El PDF del papel de resultado de «Revisar a todos» (ver
 * `revision-proveedores-papel.ts`). Mismo membrete que los demás papeles del
 * panel (`abrirPapel`: logo, nombre y RUC del negocio que revisa, así cada
 * cliente sale con su marca) y las partes fijas del formato único de papeles:
 *
 *   tipo + código + fecha arriba a la derecha · cinta ámbar si la revisión
 *   quedó incompleta · cifras por resultado · una fila por ficha · qué dice y
 *   qué NO dice el papel · código y «Página X de Y» en el pie.
 *
 * Una hoja siempre que entre (30 proveedores entran); si no, sigue en la
 * siguiente con la cabecera breve. Sólo en el navegador (jsPDF en demanda).
 */
import type { CellHookData } from "jspdf-autotable";
import { altoDelPie, dibujarPies, PALETA, tinte, type Rgb } from "@/lib/documentos/membrete-pdf";
import { ENLACE_REGISTRO_INFRACTORES } from "./serfor-infractores";
import type { NivelRevision } from "./revision-proveedores";
import {
  armarPapelRevision,
  fechaDelPapel,
  nombreDelArchivo,
  type FilaPapel,
  type RevisionParaPapel,
} from "./revision-proveedores-papel";

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

/** Los mismos tonos de la pantalla, en tinta que se lee impresa en blanco y negro. */
const TONO: Record<NivelRevision, Rgb> = {
  rojo: [180, 35, 24],
  ambar: [161, 82, 0],
  nombre: [138, 90, 43],
  limpio: [21, 112, 56],
  sin_datos: PALETA.secundario,
};

const LINEA = 1.18;
const MM_POR_PT = 0.3528;

/** Las dos celdas con título en negrita + detalle gris: autoTable mide con la negrita (más ancha) y aquí se pinta a mano. */
interface CeldaDoble {
  titulo: string;
  resto: string[];
  color: Rgb;
}

function pintarCeldaDoble(doc: Pdf, data: CellHookData, c: CeldaDoble): void {
  const { cell } = data;
  const pad = cell.padding("left");
  const ancho = cell.width - pad - cell.padding("right");
  const tam = cell.styles.fontSize;
  let y = cell.y + cell.padding("top");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tam);
  doc.setTextColor(c.color[0], c.color[1], c.color[2]);
  for (const l of doc.splitTextToSize(c.titulo, ancho) as string[]) {
    doc.text(l, cell.x + pad, y, { baseline: "top" });
    y += tam * MM_POR_PT * LINEA;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(tam - 0.5);
  doc.setTextColor(PALETA.secundario[0], PALETA.secundario[1], PALETA.secundario[2]);
  for (const r of c.resto)
    for (const l of doc.splitTextToSize(r, ancho) as string[]) {
      doc.text(l, cell.x + pad, y, { baseline: "top" });
      y += (tam - 0.5) * MM_POR_PT * LINEA;
    }
}

function celdasDe(f: FilaPapel): { proveedor: CeldaDoble; resultado: CeldaDoble } {
  return {
    proveedor: { titulo: f.nombre, resto: [f.quien], color: PALETA.tinta },
    resultado: {
      titulo: f.resultado.texto,
      resto: f.resultado.porque ? [f.resultado.porque] : [],
      color: TONO[f.resultado.tono],
    },
  };
}

/** Lo baja (por defecto) o lo devuelve como archivo (para compartirlo o probarlo). */
export async function descargarPapelRevision(d: RevisionParaPapel): Promise<string>;
export async function descargarPapelRevision(d: RevisionParaPapel, o: { comoArchivo: true }): Promise<{ blob: Blob; nombre: string }>;
export async function descargarPapelRevision(
  d: RevisionParaPapel,
  o?: { comoArchivo: true },
): Promise<string | { blob: Blob; nombre: string }> {
  const p = armarPapelRevision(d);
  const { abrirPapel } = await import("@/lib/documentos/membrete-papel");
  const papel = await abrirPapel({
    tipo: "Revisión de proveedores",
    codigo: p.codigo,
    fecha: fechaDelPapel(p),
    extra: "SERFOR y OSINFOR",
  });
  const { doc, margen, ancho } = papel;

  /* Cinta ámbar: con permisos sin respuesta de OSINFOR el papel no está para entregar. */
  if (p.pendientesOsinfor > 0) {
    const txt = `REVISIÓN INCOMPLETA · ${p.pendientesOsinfor} ${p.pendientesOsinfor === 1 ? "permiso" : "permisos"} sin respuesta de OSINFOR: vuelve a tocar «Revisar de nuevo» antes de entregar este papel.`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const lineas = doc.splitTextToSize(txt, ancho - 6) as string[];
    const alto = 3.4 + lineas.length * 8.5 * MM_POR_PT * LINEA;
    doc.setFillColor(...tinte(TONO.ambar, 0.86));
    doc.setDrawColor(...TONO.ambar);
    doc.setLineWidth(0.4);
    doc.roundedRect(margen, papel.y - 2, ancho, alto, 1.2, 1.2, "FD");
    doc.setTextColor(...TONO.ambar);
    doc.text(lineas, margen + 3, papel.y - 2 + 1.7, { baseline: "top", lineHeightFactor: LINEA });
    papel.y += alto + 3;
  }

  /* Qué se revisó y contra qué (con la fecha de cada fuente). */
  const total = p.filas.length;
  const permisos = d.resumen.permisos;
  papel.linea(
    `Revisé ${total === 1 ? "1 ficha" : `${total} fichas`} de la libreta y ${permisos === 1 ? "1 permiso" : `${permisos} permisos`} contra:`,
    { tam: 10, negrita: true, alto: 5 },
  );
  papel.linea(`• ${p.fuenteSerfor}`, { tam: 8.5, color: PALETA.secundario, alto: 4 });
  for (const l of doc.splitTextToSize(`• ${p.fuenteOsinfor}`, ancho) as string[])
    papel.linea(l, { tam: 8.5, color: PALETA.secundario, alto: 4 });
  papel.y += 2;

  /* Cinco cifras, una por resultado. */
  const hueco = 2.5;
  const anchoCaja = (ancho - hueco * (p.cuentas.length - 1)) / p.cuentas.length;
  const altoCaja = 15;
  p.cuentas.forEach((c, i) => {
    const x = margen + i * (anchoCaja + hueco);
    const color = TONO[c.tono];
    doc.setFillColor(...(c.cantidad > 0 ? tinte(color, 0.9) : PALETA.fondo));
    doc.roundedRect(x, papel.y, anchoCaja, altoCaja, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...(c.cantidad > 0 ? color : PALETA.terciario));
    doc.text(String(c.cantidad), x + 3, papel.y + 6.6);
    doc.setFontSize(7);
    doc.setFont("helvetica", c.cantidad > 0 ? "bold" : "normal");
    const et = (doc.splitTextToSize(c.etiqueta, anchoCaja - 5) as string[]).slice(0, 2);
    doc.text(et, x + 3, papel.y + 9.6, { baseline: "top", lineHeightFactor: 1.1 });
  });
  papel.y += altoCaja + 5;

  /* Una fila por ficha: lo grave arriba. */
  const celdas = p.filas.map(celdasDe);
  const anchos = [7, ancho * 0.27, ancho * 0.18, ancho * 0.31];
  papel.tabla({
    head: [["N.°", "Proveedor", "Resultado", "SERFOR (Registro de Infractores)", "OSINFOR por permiso"]],
    body: p.filas.map((f, i) => {
      const c = celdas[i];
      return [
        String(f.n),
        [c?.proveedor.titulo ?? "", ...(c?.proveedor.resto ?? [])].join("\n"),
        [c?.resultado.titulo ?? "", ...(c?.resultado.resto ?? [])].join("\n"),
        f.serfor.join("\n"),
        f.osinfor.join("\n"),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 1.6, valign: "top", textColor: [...PALETA.tinta], lineColor: [...PALETA.regla], lineWidth: 0.1 },
    headStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: anchos[0], halign: "right", textColor: [...PALETA.terciario] },
      1: { cellWidth: anchos[1], fontStyle: "bold" },
      2: { cellWidth: anchos[2], fontStyle: "bold" },
      3: { cellWidth: anchos[3] },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const f = p.filas[data.row.index];
      if (!f) return;
      if (data.column.index === 2) data.cell.styles.fillColor = [...tinte(TONO[f.resultado.tono], 0.92)];
      if (data.column.index === 3 && f.serfor[0] !== "No figura" && f.serfor[0] !== "No se pudo buscar")
        data.cell.styles.textColor = [...TONO[f.resultado.tono]];
      if (data.column.index >= 3) data.cell.styles.fontSize = 7.5;
    },
    willDrawCell: (data) => {
      if (data.section === "body" && (data.column.index === 1 || data.column.index === 2)) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const c = celdas[data.row.index];
      if (!c) return;
      if (data.column.index === 1) pintarCeldaDoble(doc, data, c.proveedor);
      if (data.column.index === 2) pintarCeldaDoble(doc, data, c.resultado);
    },
  });

  /* Qué dice y qué NO dice: nunca «madera legal». */
  const aviso = [
    "Qué dice este papel: si cada ficha figura en las listas públicas de SERFOR y OSINFOR a las fechas de arriba. No dice si la madera es legal o ilegal, ni reemplaza la GTF, el permiso ni la verificación en campo.",
    "«Revisar» = PAU en trámite en OSINFOR o el permiso tiene una sanción a nombre de otra persona · «Posible: mismo nombre» = puede ser otra persona: confirmar con su RUC/DNI · «Sin datos» = faltó RUC/DNI, nombre o permiso para buscar.",
    `Para comprobar: ${ENLACE_REGISTRO_INFRACTORES.replace(/^https:\/\//, "")} · sisfor.osinfor.gob.pe · Revisión hecha con Buleje.`,
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const lineasAviso = aviso.flatMap((a) => doc.splitTextToSize(a, ancho - 6) as string[]);
  const altoAviso = 3.4 + lineasAviso.length * 7.5 * MM_POR_PT * 1.25 + (aviso.length - 1) * 0.8;
  papel.espacio(altoAviso + 2);
  doc.setFillColor(...PALETA.fondo);
  doc.setDrawColor(...PALETA.regla);
  doc.setLineWidth(0.2);
  doc.roundedRect(margen, papel.y, ancho, altoAviso, 1.2, 1.2, "FD");
  let y = papel.y + 1.8;
  aviso.forEach((a, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setTextColor(...(i === 0 ? PALETA.tinta : PALETA.secundario));
    const ls = doc.splitTextToSize(a, ancho - 6) as string[];
    doc.text(ls, margen + 3, y, { baseline: "top", lineHeightFactor: 1.25 });
    y += ls.length * 7.5 * MM_POR_PT * 1.25 + 0.8;
  });

  /* Pie: el de todos los papeles + el código del papel al centro, en cada hoja. */
  dibujarPies(doc, papel.mb);
  for (let h = 1; h <= doc.getNumberOfPages(); h++) {
    doc.setPage(h);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PALETA.secundario);
    // Misma altura que «Emitido el…» y «Página X de Y» (`dibujarPies`: línea a H − pie + 3, texto 4,2 mm debajo).
    doc.text(`Código ${p.codigo}`, W / 2, H - altoDelPie() + 3 + 4.2, { align: "center" });
  }

  const nombre = nombreDelArchivo(p, papel.mb.titulo);
  if (o?.comoArchivo) return { blob: doc.output("blob"), nombre };
  doc.save(nombre);
  return nombre;
}
