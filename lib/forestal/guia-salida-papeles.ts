/**
 * guia-salida-papeles — los papeles de la GTF de SALIDA de un despacho del
 * Libro CTP, listos para el visor (27-10): la hoja SERFOR de la guía ENTERA
 * (original + 2 copias, con todos sus productos: una guía ampara varias líneas
 * con el mismo N°, ADR-362) y, si salieron trozas sin aserrar (ADR-363), su
 * lista de trozas partida en hojas como la del Libro TH. Una guía anulada sale
 * con el sello en cada hoja, nunca como válida.
 *
 * Client-safe: el QR lo arma `documentoGtfSalida` (asíncrono). Los valores son
 * los que devolvió el servidor (`RUTA_GUIA_SALIDA`): acá no se recalcula nada
 * salvo la tira de la cabecera, que resume la guía como `despachoDeGuia`.
 */

import { documentoHtml, selloDoc } from "./ctp-documento-print";
import type { CtpFicha, PermisoDeGuia } from "./ctp-ficha-types";
import { volumenTotalDeLaGuia } from "./ctp-gtf-formato";
import { documentoGtfSalida, type GtfDespacho } from "./ctp-gtf-print";
import type { GuiaSalidaImprimible, RespuestaGuiaSalida } from "./guia-salida-imprimible";
import { listaDeTrozasImprimible, type HojaGuiaLoth } from "./loth-guia-print";

const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

const distintos = (xs: ReadonlyArray<string | null | undefined>): string[] => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

/**
 * La tira de la cabecera de la hoja: con una especie dice la especie y con
 * varias «Varias especies (N)» — poner una sola cuando viajan tres se lee en un
 * control como declaración falsa—. El volumen es el Total de la guía (la suma
 * de sus filas ya redondeadas), el mismo del (34h).
 */
export function despachoDeLaGuiaSalida(guia: GuiaSalidaImprimible): GtfDespacho {
  const especies = distintos(guia.lineas.map((l) => l.comun));
  const productos = distintos(guia.lineas.map((l) => l.tipoProducto));
  const cientificos = distintos(guia.lineas.map((l) => l.cientifico));
  const unidad = guia.lineas[0]?.unidad ?? "m3";
  const piezas = guia.lineas.reduce((a, l) => a + (Number(l.cantidad) || 0), 0);
  return {
    id: guia.despachoId,
    lineNo: guia.lineNo,
    entryDate: guia.fecha,
    speciesCommon: especies.length === 1 ? especies[0]! : especies.length > 1 ? `Varias especies (${especies.length})` : null,
    speciesScientific: especies.length === 1 && cientificos.length === 1 ? cientificos[0]! : null,
    cites: Boolean(guia.datos.citesPermiso?.trim()) || guia.trozas.some((t) => t.cites),
    productType: productos.length === 1 ? productos[0]! : productos.length > 1 ? `Varios productos (${productos.length})` : null,
    quantity: String(volumenTotalDeLaGuia(guia.lineas)),
    unitLabel: UNIDAD[unidad] ?? unidad,
    pieces: piezas || null,
    gtfNumber: guia.gtfNumber,
    destino: guia.datos.destinatario?.nombre?.trim() || null,
  };
}

export interface PapelesGuiaSalida {
  /** La hoja SERFOR: original + 2 copias (art. 5). */
  gtf: HojaGuiaLoth;
  /** La lista de trozas, sólo si salieron trozas sin aserrar. */
  lista: HojaGuiaLoth | null;
}

/**
 * Los papeles de la guía. `anulada`: el motivo (o null si está viva); la
 * guía anulada lleva el sello en cada hoja. Lanza si la guía no se puede
 * imprimir (`documentoGtfSalida`: sin N° o con casilleros que faltan) — quien
 * llama mira `guia.faltan` antes, para decirlo sin abrir nada.
 */
export async function papelesGuiaSalida(
  { guia, entradas }: RespuestaGuiaSalida,
  ficha: Partial<CtpFicha>,
  permisos: readonly PermisoDeGuia[] | null,
  anulada: string | null,
): Promise<PapelesGuiaSalida> {
  const conTrozas = guia.trozas.length > 0;
  const d = await documentoGtfSalida(
    despachoDeLaGuiaSalida(guia),
    ficha,
    guia.cadena,
    guia.datos,
    guia.lineas,
    permisos,
    conTrozas ? guia.trozas.length : undefined,
  );
  const sello = anulada != null || guia.anulada ? selloDoc("Anulada", anulada?.trim() || "La guía se anuló en el libro", "rojo") : "";
  const cuerpos = sello ? d.cuerpos.map((c) => `${sello}${c}`) : d.cuerpos;
  const productos = guia.lineas.length;
  return {
    gtf: {
      nombre: d.titulo,
      archivo: d.titulo,
      etiqueta: `Original + 2 copias (art. 5) · ${productos} producto${productos === 1 ? "" : "s"}`,
      pieCorrido: d.pieCorrido,
      html: documentoHtml({ titulo: d.titulo, css: d.css, cuerpo: cuerpos, pieCorrido: d.pieCorrido }),
    },
    lista: conTrozas ? listaDeTrozasImprimible(entradas, sello) : null,
  };
}
