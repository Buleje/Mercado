/**
 * El PDF de la parte trasera del camión: croquis + formato, en una hoja A4.
 *
 * Client-only con imports dinámicos (jsPDF pesa: no entra al bundle hasta que
 * alguien pide el PDF), como `distribucion-export`. El croquis sale del MISMO
 * `acomodarCroquis` que la pantalla: lo que se ve es lo que se imprime.
 */
import { acomodarCroquis, formatoTrasera, pulgAMetros, type Croquis } from "./camion-croquis";
import type { PiezaCubicada } from "./cubicacion";
import { fmtM3 } from "./cubicacion-formato";

/**
 * La paleta del croquis en RGB, en el MISMO orden que `COLORES_ESPECIE` de la
 * pantalla (`--data-5…8`, `--data-2`, `--data-1`, `--data-3`, success). El PDF
 * no lee variables CSS: estos son los valores del tema claro.
 */
const PALETA_PDF: readonly [number, number, number][] = [
  [0, 160, 160],
  [14, 165, 233],
  [255, 107, 91],
  [139, 92, 246],
  [82, 82, 82],
  [10, 10, 10],
  [163, 163, 163],
  [4, 120, 87],
];
const rgb = (i: number) => PALETA_PDF[i % PALETA_PDF.length];
const fecha = () => new Date().toISOString().slice(0, 10);
const m = (pulg: number) => pulgAMetros(pulg).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pt2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Doc = InstanceType<typeof import("jspdf").jsPDF>;
/* Mismas proporciones que el croquis de la pantalla (`cubicador-trasera-croquis`). */
const BARANDA_MIN = 16;
const CHASIS = 4;
const LLANTA_W = 8;
const LLANTA_H = 11;

/** Dibuja el croquis en la caja (x, y, ancho, altoMax) y devuelve el alto usado. */
function dibujarCroquis(doc: Doc, c: Croquis, x0: number, y0: number, ancho: number, altoMax: number): number {
  const baranda = Math.max(BARANDA_MIN, c.altoPulg + 3);
  const totalPulgW = c.anchoPulg + 8;
  const totalPulgH = baranda + CHASIS + LLANTA_H + 3;
  const k = Math.min(ancho / totalPulgW, altoMax / totalPulgH);
  const ox = x0 + (ancho - totalPulgW * k) / 2 + 4 * k;
  const piso = y0 + baranda * k;
  doc.setFillColor(140, 140, 140);
  doc.rect(ox - 2.5 * k, piso - baranda * k, 2.5 * k, baranda * k, "F");
  doc.rect(ox + c.anchoPulg * k, piso - baranda * k, 2.5 * k, baranda * k, "F");
  doc.setFillColor(80, 80, 80);
  doc.rect(ox - 4 * k, piso, (c.anchoPulg + 8) * k, CHASIS * k, "F");
  doc.setFillColor(40, 40, 40);
  for (const cx of [c.anchoPulg * 0.16, c.anchoPulg * 0.84]) {
    doc.roundedRect(ox + (cx - LLANTA_W - 0.6) * k, piso + CHASIS * k, LLANTA_W * k, LLANTA_H * k, 2 * k, 2 * k, "F");
    doc.roundedRect(ox + (cx + 0.6) * k, piso + CHASIS * k, LLANTA_W * k, LLANTA_H * k, 2 * k, 2 * k, "F");
  }
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  const fs = Math.max(5, Math.min(9, 1.6 * k * 2));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fs);
  for (const r of c.rects) {
    const [cr, cg, cb] = rgb(r.color);
    const rx = ox + r.x * k, ry = piso - (r.y + r.h) * k, rw = r.w * k, rh = r.h * k;
    doc.setFillColor(cr, cg, cb);
    doc.rect(rx, ry, rw, rh, "FD");
    if (rw >= doc.getTextWidth(r.etiqueta) + 2 && rh >= fs * 0.9) {
      doc.setTextColor(255, 255, 255);
      doc.text(r.etiqueta, rx + rw / 2, ry + rh / 2, { align: "center", baseline: "middle" });
    }
  }
  doc.setTextColor(60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Ancho ${m(c.anchoPulg)} m · Alto de la pila ${m(c.altoPulg)} m`, x0 + ancho / 2, piso + (CHASIS + LLANTA_H) * k + 12, { align: "center" });
  return totalPulgH * k + 18;
}

type AutoTable = (typeof import("jspdf-autotable"))["default"];

/**
 * Dibuja la trasera —título, croquis, leyenda y formato— en la página ACTUAL
 * de un `jsPDF` ya abierto (A4 vertical, en pt). La usan el PDF propio de la
 * trasera y el del ANEXO N° 04, que la agrega como última hoja (Brandon,
 * 2026-10-03: «el chofer lleva una sola hoja»).
 */
export function dibujarTraseraEnDoc(
  doc: Doc,
  autoTable: AutoTable,
  piezas: readonly PiezaCubicada[],
  anchoM: number,
  catalogo: readonly string[] = [],
): void {
  const croquis = acomodarCroquis(piezas, { anchoM, catalogo });
  const formato = formatoTrasera(piezas, catalogo);
  const W = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Parte trasera del camión", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(
    `Fecha: ${fecha()} · ${formato.totales.piezas} piezas · ${pt2(formato.totales.pt)} PT · ${fmtM3(formato.totales.m3)} m³ · vista desde la compuerta`,
    40, 60,
  );

  let y = 76;
  y += dibujarCroquis(doc, croquis, 40, y, W - 80, 330);
  const avisos = [
    croquis.sinDibujar > 0 ? `+${croquis.sinDibujar} piezas más que no se dibujan` : "",
    croquis.noCaben > 0 ? `${croquis.noCaben} piezas más anchas que el camión o sin medida` : "",
  ].filter(Boolean);
  if (avisos.length > 0) { doc.setFontSize(8); doc.setTextColor(150, 60, 40); doc.text(avisos.join(" · "), 40, y); y += 12; }

  // Leyenda: una muestra por especie.
  doc.setFontSize(8.5); doc.setTextColor(30);
  let lx = 40;
  for (const l of croquis.leyenda) {
    const txt = `${l.especie} · ${l.piezas} pzas`;
    const w = 14 + doc.getTextWidth(txt) + 14;
    if (lx + w > W - 40) { lx = 40; y += 14; }
    const [cr, cg, cb] = rgb(l.color);
    doc.setFillColor(cr, cg, cb);
    doc.rect(lx, y - 7, 9, 9, "F");
    doc.text(txt, lx + 13, y);
    lx += w;
  }
  y += 14;

  autoTable(doc, {
    head: [["N°", "Especie", "Medida (E×A×L)", "Tipo", "Piezas", "Pie tablar", "m³"]],
    body: formato.filas.map((f) => [String(f.n), `    ${f.especie}`, f.medida, f.tipo, String(f.piezas), pt2(f.pt), fmtM3(f.m3)]),
    foot: [["", "TOTAL", "", "", String(formato.totales.piezas), pt2(formato.totales.pt), fmtM3(formato.totales.m3)]],
    startY: y,
    showFoot: "lastPage",
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    // La muestra de color de la especie, dibujada dentro de la celda.
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const fila = formato.filas[data.row.index];
      if (!fila) return;
      const [cr, cg, cb] = rgb(fila.color);
      doc.setFillColor(cr, cg, cb);
      doc.rect(data.cell.x + 4, data.cell.y + data.cell.height / 2 - 4, 8, 8, "F");
    },
  });
}

export async function exportarTraseraPDF(piezas: readonly PiezaCubicada[], anchoM: number, catalogo: readonly string[] = []): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  dibujarTraseraEnDoc(doc, autoTable, piezas, anchoM, catalogo);
  doc.save(`trasera-camion-${fecha()}.pdf`);
}
