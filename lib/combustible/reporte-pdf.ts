/**
 * reporte-pdf.ts — el reporte MENSUAL del cuaderno de combustible en cilindros,
 * en papel (A4 vertical, membrete del negocio). Es lo que Blas muestra a SUNAT
 * (bienes fiscalizados) o a quien fiscalice: lo declarado, el resumen, cada
 * compra, vale y conteo, el saldo día por día, el acumulado del año, las alertas
 * y la firma del responsable.
 *
 * Client-only: jspdf y jspdf-autotable entran por import dinámico. Es papel:
 * negro y grises en valores literales (como los demás exportes forestales).
 */
import type { RowInput } from "jspdf-autotable";
import { rangoCilindros, type ReporteMes } from "./cuaderno";
import { abrirPdfForestal, hoyEnLima } from "@/lib/forestal/membrete-forestal";
import {
  SIN_MOVIMIENTOS, cilindrosDelVale, filasAcumulado, filasDeclarado, fmt2, fmtDia, fmtFecha,
  fmtSigno, lineasAnulados, nivelTexto, nombreArchivo, textoDato, type FilaDato,
} from "./reporte-formato";

type Rgb = [number, number, number];
type Celda = string | number;

const TINTA: Rgb = [17, 24, 39];
const TENUE: Rgb = [107, 114, 128];
const CABECERA: Rgb = [55, 65, 81];
const FONDO_TOTAL: Rgb = [229, 231, 235];
const FONDO_ETIQUETA: Rgb = [243, 244, 246];
const LINEA: Rgb = [156, 163, 175];

interface OpcionesTabla {
  head: string[];
  body: Celda[][];
  foot?: Celda[];
  /** Columnas con cifras (alineadas a la derecha). */
  derecha?: number[];
  centro?: number[];
  /** Tamaño de letra (pt): 8 por defecto; el saldo diario baja a 7 para entrar en ~1 hoja. */
  fuente?: number;
  /** Lo que dice la tabla si no tiene filas. */
  vacio?: string;
  /** Filas del cuerpo en negrita (índice dentro de `body`). */
  fuerte?: (fila: number) => boolean;
  /** Filas del cuerpo en gris (días sin movimiento). */
  tenue?: (fila: number) => boolean;
}

export async function descargarReportePdf(rep: ReporteMes): Promise<void> {
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = await abrirPdfForestal({
    tipo: "Cuaderno de combustible",
    codigo: rep.titulo,
    extra: rep.hastaDias < rep.hasta ? `Del ${fmtDia(rep.desde)} al ${fmtDia(rep.hastaDias)} (mes en curso)` : `Del ${fmtDia(rep.desde)} al ${fmtDia(rep.hasta)}`,
  });
  const { doc } = pdf;
  let y = pdf.y + 2;
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const limite = pdf.alto - pdf.margenTabla.bottom;

  /** Pasa a la hoja siguiente (con su cabecera breve) si lo que viene no entra. */
  const hacerLugar = (alto: number) => {
    if (y + alto > limite) {
      doc.addPage();
      y = pdf.breve();
    }
  };

  const titulo = (texto: string, tam = 10.5) => {
    hacerLugar(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(tam);
    doc.setTextColor(...TINTA);
    doc.text(texto, pdf.margen, y + 4);
    y += 6;
  };

  const nota = (texto: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TENUE);
    doc.text(texto, pdf.margen, y - 2.5);
    y += 2;
  };

  const tabla = (o: OpcionesTabla) => {
    const fuente = o.fuente ?? 8;
    const vacia = o.body.length === 0;
    const body: RowInput[] = vacia
      ? [[{ content: o.vacio ?? SIN_MOVIMIENTOS, colSpan: o.head.length, styles: { halign: "center", textColor: TENUE, fontStyle: "italic" } }]]
      : o.body;
    const columnStyles: Record<string, { halign: "right" | "center" }> = {};
    for (const i of o.derecha ?? []) columnStyles[String(i)] = { halign: "right" };
    for (const i of o.centro ?? []) columnStyles[String(i)] = { halign: "center" };
    autoTable(doc, {
      startY: y,
      head: [o.head],
      body,
      foot: !vacia && o.foot ? [o.foot] : undefined,
      showFoot: "lastPage",
      margin: pdf.margenTabla,
      didDrawPage: pdf.alDibujarPagina,
      theme: "grid",
      styles: { fontSize: fuente, cellPadding: fuente <= 7 ? 1 : 1.5, lineColor: LINEA, lineWidth: 0.1, textColor: TINTA, overflow: "linebreak" },
      headStyles: { fillColor: CABECERA, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: FONDO_TOTAL, textColor: TINTA, fontStyle: "bold" },
      columnStyles,
      didParseCell: (data) => {
        if (data.section !== "body" || vacia) return;
        if (o.tenue?.(data.row.index)) data.cell.styles.textColor = TENUE;
        if (o.fuerte?.(data.row.index)) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = TINTA;
        }
      },
    });
    y = finalY() + 6;
  };

  /** Dato → valor en dos pares por renglón (concepto · valor · concepto · valor). */
  const datos = (filas: FilaDato[]) => {
    const body: Celda[][] = [];
    for (let i = 0; i < filas.length; i += 2) {
      const a = filas[i];
      const b = filas[i + 1];
      body.push([a.concepto, textoDato(a), b?.concepto ?? "", b ? textoDato(b) : ""]);
    }
    const etiqueta = { fillColor: FONDO_ETIQUETA, fontStyle: "bold" as const, cellWidth: 46 };
    autoTable(doc, {
      startY: y,
      body,
      margin: pdf.margenTabla,
      didDrawPage: pdf.alDibujarPagina,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: LINEA, lineWidth: 0.1, textColor: TINTA },
      columnStyles: { 0: etiqueta, 1: { halign: "right" }, 2: etiqueta, 3: { halign: "right" } },
      didParseCell: (data) => {
        const t = data.cell.raw;
        if (data.section === "body" && (t === "Cuadra" || t === "NO cuadra")) data.cell.styles.fontStyle = "bold";
      },
    });
    y = finalY() + 6;
  };

  // 1 · Lo declarado
  titulo("1. Lo declarado");
  datos(filasDeclarado(rep));

  // 2 · Resumen del mes
  // Una fila por concepto con sus galones y cilindros lado a lado (en pares de a dos se leía cruzado).
  const filaSaldoFinal = rep.totalInicial > 0 ? 5 : 4;
  titulo(`2. Resumen de ${rep.titulo}`);
  tabla({
    head: ["Concepto", "Galones", "Cilindros"],
    body: [
      ["Saldo inicial", fmt2(rep.saldoInicial.gal), String(rep.saldoInicial.cil)],
      [`Compras del mes (${rep.compras.length}) · S/ ${fmt2(rep.totalCompras.monto)}`, `+${fmt2(rep.totalCompras.gal)}`, `+${rep.totalCompras.cil}`],
      ...(rep.totalInicial > 0 ? [["Stock inicial anotado", `+${fmt2(rep.totalInicial)}`, "—"]] : []),
      [`Consumo del mes (${rep.vales.length} vale${rep.vales.length === 1 ? "" : "s"})`, rep.totalConsumo ? `-${fmt2(rep.totalConsumo)}` : "0.00", "—"],
      [`Diferencias de conteo (${rep.conteos.length})`, rep.totalDiferencias ? fmtSigno(rep.totalDiferencias) : "0.00", "—"],
      ["Saldo final", fmt2(rep.saldoFinal.gal), String(rep.saldoFinal.cil)],
    ],
    foot: ["Balance: inicial + compras - consumo + diferencias = final", rep.cuadra ? "Cuadra" : "NO cuadra", ""],
    derecha: [1, 2],
    fuente: 8.5,
    fuerte: (i) => i === 0 || i === filaSaldoFinal,
  });

  // 3 · Compras (+ stock inicial anotado)
  titulo("3. Compras del mes");
  tabla({
    head: ["Fecha", "Factura", "Grifo", "RUC", "Guía", "Cilindros", "Galones", "Precio/gal", "Monto S/"],
    body: rep.compras.map((i) => [
      fmtFecha(i.fecha), i.factura ?? "—", i.grifo ?? "—", i.grifoRuc ?? "—", i.guia ?? "—",
      rangoCilindros(i.primerCilindro, i.cilindros), fmt2(i.galones), i.precioGal != null ? fmt2(i.precioGal) : "—", fmt2(i.monto),
    ]),
    foot: ["Total", "", "", "", "", String(rep.totalCompras.cil), fmt2(rep.totalCompras.gal), "", fmt2(rep.totalCompras.monto)],
    derecha: [6, 7, 8],
    fuente: 7.5,
  });
  if (rep.iniciales.length > 0) {
    titulo("Stock inicial anotado", 9.5);
    tabla({
      head: ["Fecha", "Cilindros", "Galones", "Notas"],
      body: rep.iniciales.map((i) => [fmtFecha(i.fecha), rangoCilindros(i.primerCilindro, i.cilindros), fmt2(i.galones), i.notas?.trim() || "—"]),
      derecha: [2],
      fuente: 7.5,
    });
  }

  // 4 · Consumo por máquina
  titulo("4. Consumo por máquina");
  tabla({
    head: ["Máquina", "Placa", "Vales", "Galones", "Horas", "Gal/h", "Meta gal/h", "Observación"],
    body: rep.consumo.map((c) => [
      c.maquina, c.placa ?? "—", String(c.vales), fmt2(c.galones), c.horas > 0 ? fmt2(c.horas) : "—",
      c.galPorHora != null ? fmt2(c.galPorHora) : "—", c.meta != null ? fmt2(c.meta) : "—", c.sobreMeta ? "Sobre meta" : "",
    ]),
    foot: ["Total", "", String(rep.consumo.reduce((s, c) => s + c.vales, 0)), fmt2(rep.totalConsumo), "", "", "", ""],
    derecha: [2, 3, 4, 5, 6],
    fuerte: (i) => rep.consumo[i]?.sobreMeta === true,
    fuente: 7.5,
  });

  // 5 · Vales
  titulo("5. Vales de combustible");
  tabla({
    head: ["N.°", "Fecha", "Máquina", "Horómetro", "Galones", "Cilindro(s)", "Operador", "Firmado", "Gal/h"],
    body: rep.vales.map((v) => [
      v.vale.numero != null ? String(v.vale.numero) : "—", fmtFecha(v.vale.fecha), v.vale.maquina,
      v.vale.horometro != null ? v.vale.horometro.toLocaleString("es-PE", { maximumFractionDigits: 1 }) : "—",
      fmt2(v.vale.galones), cilindrosDelVale(v), v.vale.operador?.trim() || "—", v.vale.firmado ? "Sí" : "—",
      v.rend?.galPorHora != null ? fmt2(v.rend.galPorHora) : "—",
    ]),
    foot: ["Total", "", "", "", fmt2(rep.totalConsumo), "", "", "", ""],
    derecha: [3, 4, 8],
    centro: [7],
    fuente: 7.5,
  });

  // 6 · Conteos
  titulo("6. Conteos de cilindros");
  tabla({
    head: ["Fecha", "Contado", "Cuaderno", "Diferencia (gal)", "Contó", "Testigo"],
    body: rep.conteos.map(({ conteo, libroCil, libroGal, difGal }) => [
      fmtFecha(conteo.fecha), `${conteo.cilindrosContados} cil / ${fmt2(conteo.galonesContados)} gal`, `${libroCil} cil / ${fmt2(libroGal)} gal`,
      fmtSigno(difGal), conteo.contadoPor, conteo.testigo?.trim() || "—",
    ]),
    foot: ["Total", "", "", fmtSigno(rep.totalDiferencias), "", ""],
    derecha: [3],
    fuente: 7.5,
  });
  if (rep.conteos.length > 0) nota("Diferencia = contado - cuaderno: negativo es faltante, positivo es sobrante.");

  // 7 · Saldo diario
  titulo("7. Saldo diario");
  tabla({
    head: ["Día", "Entradas (gal)", "Salidas (gal)", "Ajuste (gal)", "Saldo (gal)", "Cilindros", "Nivel"],
    body: rep.dias.map((d) => [
      fmtDia(d.dia), d.entradasGal ? fmt2(d.entradasGal) : "—", d.salidasGal ? fmt2(d.salidasGal) : "—",
      d.ajusteGal ? fmtSigno(d.ajusteGal) : "—", fmt2(d.saldoGal), String(d.cilindros), nivelTexto(d.nivel),
    ]),
    derecha: [1, 2, 3, 4, 5],
    fuente: 7,
    tenue: (i) => rep.dias[i]?.conMovimiento === false,
    fuerte: (i) => rep.dias[i]?.nivel !== "ok",
  });

  // 8 · Acumulado del año
  titulo(`8. Acumulado del año ${rep.anio}`);
  datos(filasAcumulado(rep));

  // 9 · Alertas y anulados
  titulo("9. Alertas");
  tabla({ head: ["Alertas del mes"], body: rep.alertas.map((a) => [a]), vacio: "Sin alertas" });
  const anulados = lineasAnulados(rep);
  if (anulados.length > 0) {
    titulo("Anulados del mes", 9.5);
    tabla({ head: ["Registro anulado y motivo"], body: anulados.map((a) => [a]), fuente: 7.5 });
  }

  // 10 · Firma
  hacerLugar(30);
  y += 6;
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.line(pdf.margen, y + 12, pdf.margen + 72, y + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...TINTA);
  doc.text(rep.config.responsable?.trim() || "Responsable del cuaderno", pdf.margen, y + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TENUE);
  doc.text("Responsable del cuaderno de combustible", pdf.margen, y + 21.5);
  doc.text(`Fecha de emisión: ${fmtDia(hoyEnLima())}`, pdf.ancho - pdf.margen, y + 17, { align: "right" });

  pdf.cerrar();
  doc.save(nombreArchivo(rep, "pdf"));
}
