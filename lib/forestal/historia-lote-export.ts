"use client";

/**
 * historia-lote-export — el expediente del lote como archivo: PDF y Excel.
 *
 * Los dos aceptan VARIOS lotes de una, y por el mismo motivo: nadie audita un
 * lote suelto. Se revisa el trimestre, o los cinco lotes de una especie, o los
 * tres que alimentaron una guía. Bajar de a uno y pegar a mano es donde se
 * pierden filas.
 *
 *  · **PDF** — un documento con un lote por página. Es el papel que se entrega:
 *    se lee en orden y no se puede editar sin que se note.
 *  · **Excel** — cuatro hojas (Resumen · Trozas · Producción · Salidas), cada
 *    una con la columna «Lote» al frente. Es para cruzar: filtrar por guía,
 *    sumar por especie, pegar contra la planilla del contador.
 *
 * Por qué CUATRO hojas y no una: las cuatro etapas tienen granularidades
 * distintas —una fila por troza, una por paquete, una por guía— y aplastarlas
 * en una sola tabla obliga a repetir el lote en columnas vacías y rompe
 * cualquier tabla dinámica. El «Resumen» es la única con una fila por lote.
 *
 * ⚠️ El PDF y el Excel arrastran el mismo aviso que la pantalla: cuando una
 * corrida se comparte entre dos lotes, lo despachado es un TECHO. Un archivo
 * que se lleva el número sin la advertencia es peor que la pantalla.
 */

import type { HistoriaLote } from "./historia-lote";

const n4 = (v: number | null | undefined) => (v == null ? "" : Number(v).toFixed(4));
const n2 = (v: number | null | undefined) => (v == null ? "" : Number(v).toFixed(2));
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "";
const unidad = (u: string | null | undefined) => (!u || u === "m3" ? "m³" : u);
const hoy = () => new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Nombre de archivo: un lote lleva su código, varios llevan el conteo. */
function nombreArchivo(historias: readonly HistoriaLote[], ext: string): string {
  const sello = new Date().toISOString().slice(0, 10);
  return historias.length === 1
    ? `historia-lote-${historias[0].lote.code.replace(/[^\w.-]+/g, "-")}-${sello}.${ext}`
    : `historia-lotes-${historias.length}-${sello}.${ext}`;
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Los tonos de las cuatro etapas, en RGB para jsPDF (no entiende CSS vars). */
const RGB_ETAPA: Record<1 | 2 | 3 | 4, [number, number, number]> = {
  1: [14, 165, 233],
  2: [255, 107, 91],
  3: [0, 160, 160],
  4: [139, 92, 246],
};

export async function exportarHistoriasPDF(historias: readonly HistoriaLote[]): Promise<void> {
  if (historias.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;

  historias.forEach((h, i) => {
    if (i > 0) doc.addPage();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(20);
    doc.text(`Historia del lote ${h.lote.code}`, 40, 46);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      [
        h.lote.speciesCommon ?? "sin especie",
        h.lote.speciesScientific ?? null,
        `estado: ${h.lote.status}`,
        `armado el ${fecha(h.armado.fecha)}`,
        `emitido ${hoy()}`,
      ]
        .filter(Boolean)
        .join(" · "),
      40,
      62,
    );

    /* El recorrido en una fila, con la franja de color de cada etapa: el que
       hojea veinte páginas encuentra el tramo por el color, no leyendo. */
    autoTable(doc, {
      startY: 76,
      head: [["1 · Se apartó", "2 · Entró a la sierra", "3 · Salió aserrado", "4 · Se despachó"]],
      body: [
        [
          `${h.armado.piezas} pz · ${n4(h.armado.m3)} m³`,
          `${n4(h.consumo.m3Total)} m³`,
          h.produccion.total ? `${n4(h.produccion.total.cantidad)} ${unidad(h.produccion.total.unit)}` : "—",
          `${n4(h.salida.total)} m³`,
        ],
        [
          `${h.armado.guias.length} ${h.armado.guias.length === 1 ? "guía" : "guías"}`,
          `${h.consumo.piezasConsumidas} piezas`,
          h.produccion.rendimientoPct != null ? `rendimiento ${n2(h.produccion.rendimientoPct)} %` : "sin rendimiento",
          `${n4(h.salida.enStock)} m³ en planta`,
        ],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fontStyle: "bold", textColor: 255 },
      /* Cada columna de la cabecera con el color de SU etapa. Blanco sobre esos
         tonos no llega a AA para lectura corrida; acá son cuatro rótulos en
         negrita de una línea, y el dato va debajo en tinta sobre blanco. */
      didParseCell: (data) => {
        if (data.section !== "head") return;
        data.cell.styles.fillColor = RGB_ETAPA[(data.column.index + 1) as 1 | 2 | 3 | 4];
      },
      margin: { left: 40, right: 40 },
    });

    if (h.huecos.length > 0) {
      autoTable(doc, {
        startY: finalY() + 10,
        head: [["Lo que esta cadena no puede afirmar"]],
        body: h.huecos.map((x) => [x]),
        theme: "plain",
        styles: { fontSize: 8, textColor: [146, 64, 14], cellPadding: 3 },
        headStyles: { fontStyle: "bold", textColor: [146, 64, 14] },
        margin: { left: 40, right: 40 },
      });
    }

    // ① Armado
    autoTable(doc, {
      startY: finalY() + 14,
      head: [["Cód. planta", "Codificación", "GTF de ingreso", "Permiso", "D1 (cm)", "D2 (cm)", "Largo (m)", "m³"]],
      body: h.armado.piezas
        ? h.armado.trozas.map((t) => [
            t.codigoPlanta ?? "",
            t.codificacion ?? "",
            t.gtfNumber ?? "",
            t.permiso ?? "",
            n2(t.d1Cm),
            n2(t.d2Cm),
            n2(t.largoM),
            n4(t.volumenM3),
          ])
        : [["Sin piezas apartadas: el lote se declaró por volumen, no por troza.", "", "", "", "", "", "", ""]],
      foot: h.armado.piezas ? [[`Total · ${h.armado.piezas} piezas`, "", "", "", "", "", "", n4(h.armado.m3)]] : undefined,
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: RGB_ETAPA[1], textColor: 255, fontStyle: "bold" },
      footStyles: { fontStyle: "bold", fillColor: [245, 245, 245], textColor: 20 },
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      margin: { left: 40, right: 40 },
      didDrawPage: () => pieDePagina(doc),
    });

    // ② Consumo
    autoTable(doc, {
      startY: finalY() + 12,
      head: [["Corrida", "Fecha", "m³ de la corrida", "Piezas de este lote", "m³ de este lote"]],
      body: h.consumo.corridas.length
        ? h.consumo.corridas.map((c) => [
            `N° ${c.lineNo ?? "—"}${c.abierta ? " (sin declarar)" : ""}`,
            fecha(c.fecha),
            n4(c.m3),
            String(c.piezasDelLote),
            n4(c.m3DelLote),
          ])
        : [["Todavía no entró a la sierra.", "", "", "", ""]],
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: RGB_ETAPA[2], textColor: 255, fontStyle: "bold" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    // ③ Producción
    const filasProd = h.produccion.corridas.flatMap((c) =>
      c.paquetes.length
        ? c.paquetes.map((p) => [
            `N° ${c.lineNo ?? "—"}`,
            p.codigo ?? "",
            p.productType ?? "",
            p.presentacion ?? "",
            String(p.cantidad),
            n4(p.volumenM3),
          ])
        : [[`N° ${c.lineNo ?? "—"}`, "", c.producto ?? "", c.cantidad == null ? "sin declarar" : "sin paquetes", "", n4(c.cantidad)]],
    );
    autoTable(doc, {
      startY: finalY() + 12,
      head: [["Corrida", "Paquete", "Producto", "Presentación", "Piezas", "Volumen"]],
      body: filasProd.length ? filasProd : [["Todavía no se declaró producción.", "", "", "", "", ""]],
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: RGB_ETAPA[3], textColor: 255, fontStyle: "bold" },
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    // ④ Salida
    const filasSal = h.salida.despachos.map((d) => [
      d.gtfNumber ?? `línea N° ${d.lineNo ?? "—"}`,
      fecha(d.fecha),
      d.destino ?? "",
      n4(d.deEsteLote),
      n4(d.totalDeLaGuia),
      d.companeros.map((c) => `${c.loteCode ?? "sin lote"} (${n4(c.cantidad)})`).join(" · ") || "—",
      d.compartida ? "TECHO: corrida compartida" : "",
    ]);
    autoTable(doc, {
      startY: finalY() + 12,
      head: [["Guía", "Fecha", "Destino", "De este lote", "Total de la guía", "Viajó junto a", "Aviso"]],
      body: filasSal.length
        ? filasSal
        : [[`Nada salió todavía: ${n4(h.salida.enStock)} m³ siguen en planta.`, "", "", "", "", "", ""]],
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: RGB_ETAPA[4], textColor: 255, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 6: { textColor: [146, 64, 14] } },
      margin: { left: 40, right: 40 },
    });
  });

  doc.save(nombreArchivo(historias, "pdf"));
}

function pieDePagina(doc: { setFontSize: (n: number) => void; setTextColor: (n: number) => void; text: (s: string, x: number, y: number) => void; internal: { pageSize: { getHeight: () => number } } }): void {
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    "Documento de referencia del Libro de Operaciones del CTP. No reemplaza el registro en el MC-SNIFFS. Lo atribuido a un lote no se prorratea: cuando una corrida se comparte, se declara como techo.",
    40,
    doc.internal.pageSize.getHeight() - 22,
  );
}

// ── Excel ───────────────────────────────────────────────────────────────────

export async function exportarHistoriasExcel(historias: readonly HistoriaLote[]): Promise<void> {
  if (historias.length === 0) return;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje — Libro de Operaciones CTP";
  wb.created = new Date();

  const hoja = (nombre: string, cols: Array<{ header: string; key: string; width: number }>) => {
    const ws = wb.addWorksheet(nombre);
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    // Fila de encabezado congelada: una tabla de 800 trozas sin esto obliga a
    // subir cada vez que uno se olvida qué columna estaba mirando.
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  };

  const wsResumen = hoja("Resumen", [
    { header: "Lote", key: "lote", width: 14 },
    { header: "Especie", key: "especie", width: 20 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Armado", key: "armado", width: 12 },
    { header: "Piezas apartadas", key: "piezas", width: 16 },
    { header: "m³ en la pila", key: "m3pila", width: 14 },
    { header: "Guías de ingreso", key: "guias", width: 26 },
    { header: "m³ a la sierra", key: "consumo", width: 14 },
    { header: "Producido", key: "producido", width: 14 },
    { header: "Unidad", key: "unidad", width: 9 },
    { header: "Rendimiento %", key: "rend", width: 14 },
    { header: "Despachado", key: "despachado", width: 13 },
    { header: "En planta", key: "stock", width: 12 },
    { header: "Avisos", key: "huecos", width: 60 },
  ]);
  for (const h of historias) {
    wsResumen.addRow({
      lote: h.lote.code,
      especie: h.lote.speciesCommon ?? "",
      estado: h.lote.status,
      armado: fecha(h.armado.fecha),
      piezas: h.armado.piezas,
      m3pila: Number(h.armado.m3),
      guias: h.armado.guias.join(" · "),
      consumo: Number(h.consumo.m3Total),
      producido: h.produccion.total ? Number(h.produccion.total.cantidad) : null,
      unidad: h.produccion.total ? unidad(h.produccion.total.unit) : "",
      /* `null` y no 0: sin producción declarada no hay rendimiento, y un 0 en
         una celda de Excel se promedia con los demás y ensucia el análisis. */
      rend: h.produccion.rendimientoPct,
      despachado: Number(h.salida.total),
      stock: Number(h.salida.enStock),
      huecos: h.huecos.join(" | "),
    });
  }

  const wsTrozas = hoja("Trozas", [
    { header: "Lote", key: "lote", width: 14 },
    { header: "Cód. planta", key: "codigo", width: 16 },
    { header: "Codificación", key: "codificacion", width: 16 },
    { header: "GTF de ingreso", key: "gtf", width: 20 },
    { header: "Permiso", key: "permiso", width: 26 },
    { header: "Especie", key: "especie", width: 18 },
    { header: "D1 (cm)", key: "d1", width: 10 },
    { header: "D2 (cm)", key: "d2", width: 10 },
    { header: "Largo (m)", key: "largo", width: 11 },
    { header: "Volumen (m³)", key: "m3", width: 13 },
    { header: "Estado", key: "estado", width: 26 },
  ]);
  for (const h of historias) {
    const fuera = new Map(h.armado.fueraDeJuego.map((f) => [f.codigo, f.motivo]));
    for (const t of h.armado.trozas) {
      const clave = t.codigoPlanta || t.codificacion || t.id.slice(0, 8);
      wsTrozas.addRow({
        lote: h.lote.code,
        codigo: t.codigoPlanta ?? "",
        codificacion: t.codificacion ?? "",
        gtf: t.gtfNumber ?? "",
        permiso: t.permiso ?? "",
        especie: t.especieComun ?? "",
        d1: t.d1Cm,
        d2: t.d2Cm,
        largo: t.largoM,
        m3: t.volumenM3,
        estado: fuera.get(clave) ?? (t.consumidaEnId ? "consumida" : "en la pila"),
      });
    }
  }

  const wsProd = hoja("Producción", [
    { header: "Lote", key: "lote", width: 14 },
    { header: "Corrida", key: "corrida", width: 10 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Paquete", key: "paquete", width: 14 },
    { header: "Producto", key: "producto", width: 32 },
    { header: "Presentación", key: "presentacion", width: 16 },
    { header: "Piezas", key: "piezas", width: 10 },
    { header: "Volumen (m³)", key: "m3", width: 13 },
  ]);
  for (const h of historias) {
    for (const c of h.produccion.corridas) {
      if (c.paquetes.length === 0) {
        wsProd.addRow({
          lote: h.lote.code,
          corrida: c.lineNo,
          fecha: fecha(c.fecha),
          paquete: "",
          producto: c.producto ?? "",
          presentacion: c.cantidad == null ? "sin declarar" : "sin paquetes",
          piezas: null,
          m3: c.cantidad,
        });
        continue;
      }
      for (const p of c.paquetes) {
        wsProd.addRow({
          lote: h.lote.code,
          corrida: c.lineNo,
          fecha: fecha(c.fecha),
          paquete: p.codigo ?? "",
          producto: p.productType ?? "",
          presentacion: p.presentacion ?? "",
          piezas: p.cantidad,
          m3: p.volumenM3,
        });
      }
    }
  }

  const wsSal = hoja("Salidas", [
    { header: "Lote", key: "lote", width: 14 },
    { header: "Guía", key: "gtf", width: 22 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Destino", key: "destino", width: 24 },
    { header: "De este lote", key: "propio", width: 14 },
    { header: "Total de la guía", key: "total", width: 16 },
    { header: "Viajó junto a", key: "companeros", width: 46 },
    { header: "Atribución", key: "aviso", width: 30 },
  ]);
  for (const h of historias) {
    for (const d of h.salida.despachos) {
      wsSal.addRow({
        lote: h.lote.code,
        gtf: d.gtfNumber ?? `línea N° ${d.lineNo ?? ""}`,
        fecha: fecha(d.fecha),
        destino: d.destino ?? "",
        propio: Number(d.deEsteLote),
        total: Number(d.totalDeLaGuia),
        companeros: d.companeros.map((c) => `${c.loteCode ?? "sin lote"} (${n4(c.cantidad)})`).join(" · "),
        /* El aviso viaja EN LA FILA. En un Excel nadie lee el pie: si el techo
           no está al lado del número, el número se copia como si fuera medido. */
        aviso: d.compartida ? "TECHO — corrida compartida, no prorrateado" : "medido",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nombreArchivo(historias, "xlsx"),
  );
}
