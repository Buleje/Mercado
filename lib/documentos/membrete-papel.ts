/**
 * lib/documentos/membrete-papel.ts — un papel jsPDF listo para escribir:
 * membrete del negocio arriba (logo + nombre + tipo/código/fecha), tablas con
 * el estilo común que se continúan en la hoja siguiente con la cabecera breve,
 * y pie «Página X de Y» al cerrar. Para los listados y estados de cuenta que
 * se bajan desde el panel (Adelantos, Fiados, Préstamos…).
 *
 * Sólo en el navegador (carga el logo con `membreteDelDocumento`). jsPDF y
 * jspdf-autotable se cargan en demanda. El logo se dibuja UNA vez (la cabecera
 * breve de las hojas siguientes no lo lleva): el PDF no se infla.
 */

import type { UserOptions } from "jspdf-autotable";
import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
import {
  altoDelPie,
  datosDelMembrete,
  dibujarMembrete,
  dibujarMembreteBreve,
  dibujarPies,
  fechaDelDocumento,
  margenDelMembrete,
  PALETA,
  type DatosMembrete,
  type DocumentoMembrete,
  type MembreteDocumento,
  type OpcionesMembrete,
  type Rgb,
} from "@/lib/documentos/membrete-pdf";

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

/** `y` (mm) donde empieza el cuerpo de las hojas 2+ (lo que devuelve `dibujarMembreteBreve` en A4/apaisado normal). */
const Y_HOJA_SIGUIENTE = 29;

export interface PapelAbierto {
  doc: Pdf;
  mb: DatosMembrete;
  /** Dónde va el próximo renglón (mm desde arriba). */
  y: number;
  margen: number;
  ancho: number;
  /** Escribe un renglón y baja `y` (`alto` mm, por defecto según el tamaño). */
  linea(texto: string, o?: { tam?: number; negrita?: boolean; color?: Rgb; x?: number; alto?: number }): void;
  /** Si no quedan `alto` mm en la hoja, pasa a la siguiente con la cabecera breve. */
  espacio(alto: number): void;
  /** Una tabla con el estilo común; sigue en la hoja siguiente. Devuelve el `y` bajo la tabla. */
  tabla(opciones: UserOptions): number;
  /** Pone el pie en todas las hojas y baja el archivo. */
  cerrar(nombreArchivo: string): void;
}

export interface OpcionesPapel {
  /** Si el negocio no tiene nombre registrado, el que traiga quien llama (p. ej. Ajustes). */
  nombreRespaldo?: string | null;
  orientacion?: "p" | "l";
  /** Una vez cargado (por si quien llama ya tiene el membrete). */
  membrete?: MembreteDocumento;
}

export async function abrirPapel(documento: DocumentoMembrete, o: OpcionesPapel = {}): Promise<PapelAbierto> {
  const [{ default: jsPDF }, autoTableMod, cargado] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    o.membrete ?? membreteDelDocumento(),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: o.orientacion === "l" ? "landscape" : "portrait" });
  const m: MembreteDocumento = { ...cargado, nombre: cargado.nombre ?? o.nombreRespaldo ?? null };
  const mb = datosDelMembrete(m, { fecha: fechaDelDocumento(new Date().toISOString()), ...documento });
  const opc: OpcionesMembrete = {};
  const margen = margenDelMembrete(opc);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const papel: PapelAbierto = {
    doc,
    mb,
    y: dibujarMembrete(doc, mb, opc),
    margen,
    ancho: W - 2 * margen,
    linea(texto, l = {}) {
      const tam = l.tam ?? 10;
      doc.setFont("helvetica", l.negrita ? "bold" : "normal");
      doc.setFontSize(tam);
      const c = l.color ?? PALETA.tinta;
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text(texto, l.x ?? margen, papel.y);
      papel.y += l.alto ?? tam * 0.3528 * 1.5;
    },
    espacio(alto) {
      if (papel.y + alto <= H - altoDelPie(opc) - 2) return;
      doc.addPage();
      papel.y = dibujarMembreteBreve(doc, mb, mb.tipo, opc);
    },
    tabla(opciones) {
      autoTable(doc, {
        startY: papel.y,
        theme: "grid",
        styles: { fontSize: 9, textColor: [...PALETA.tinta], lineColor: [...PALETA.regla], lineWidth: 0.1, cellPadding: 2 },
        headStyles: { fillColor: [...mb.acento], textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [...PALETA.fondo], textColor: [...PALETA.tinta], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [...PALETA.fondo] },
        showFoot: "lastPage",
        ...opciones,
        margin: { left: margen, right: margen, top: Y_HOJA_SIGUIENTE, bottom: altoDelPie(opc) + 4 },
        didDrawPage: (datos) => {
          if (datos.pageNumber > 1) dibujarMembreteBreve(doc, mb, mb.tipo, opc);
          opciones.didDrawPage?.(datos);
        },
      });
      const fin = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? papel.y;
      papel.y = fin + 6;
      return fin;
    },
    cerrar(nombreArchivo) {
      dibujarPies(doc, mb, opc);
      doc.save(nombreArchivo);
    },
  };
  return papel;
}
