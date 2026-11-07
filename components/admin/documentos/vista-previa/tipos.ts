import { esHojaLegible } from "@/lib/documentos/hoja-calculo";
import { esTextoLegible } from "@/lib/documentos/texto-docx";
import { esPresentacion } from "@/lib/documentos/presentacion";
import { type AccionesDoc } from "../BarraHerramientasDoc";
import { type AccionesCarpeta } from "../PanelCarpetasDoc";
import { type AccionesEnLote } from "../ExploradorDoc";
import { type PestanaVisor } from "../vista-previa/CabeceraVistaPrevia";
import { esImagenRenderizable, esImagenConvertible } from "@/lib/documents/tipos-archivo";
import { type DbDocument, type DbDocumentFolder } from "@/lib/types/documents";

export type Tab = PestanaVisor;

export interface Props {
  docId: string;
  onClose: () => void;
  onRefresh?: () => void;
  /** Lista completa (para resolver/elegir documentos relacionados). */
  allDocs?: DbDocument[];
  /** Carpetas del drive (para mostrar la ubicación y mover desde Detalles). */
  folders?: DbDocumentFolder[];
  /** Navegación entre documentos de la lista (undefined en los extremos). */
  onPrev?: () => void;
  onNext?: () => void;
  position?: { current: number; total: number };
  /** Documento anterior y siguiente, para ir trayéndolos por adelantado. */
  vecinos?: DbDocument[];
  /**
   * Qué hacer con varios archivos elegidos en la columna del medio. Son las
   * mismas acciones de la barra del drive: sin ellas habría que cerrar el
   * visor para borrar dos boletas o mandarle tres facturas al contador.
   */
  lote?: AccionesEnLote;
  /**
   * Las acciones del menú de la lista, para poder usarlas sin cerrar el
   * documento. Opcional: donde no se pasen, el menú no aparece.
   */
  herramientas?: AccionesDoc;
  /** Crear/renombrar carpetas y mover el documento desde el propio visor. */
  carpetas?: AccionesCarpeta;
  /** Saltar a otro documento sin cerrar (lo usan los "parecidos a este"). */
  onAbrirOtro?: (doc: DbDocument) => void;
}
/** Qué es el archivo según su tipo: decide cómo se dibuja la vista previa. */
export function tiposDeDoc(doc: DbDocument) {
  const isPdf = doc.mimeType === "application/pdf";
  const isImage = esImagenRenderizable(doc.name, doc.mimeType);
  /** HEIC/TIFF/SVG: el navegador no las dibuja, el servidor las convierte a PNG. */
  const imagenConvertible = !isImage && esImagenConvertible(doc.name, doc.mimeType);
  /** .pptx/.odp: se muestra el guion de las diapositivas. */
  const esPresenta = esPresentacion(doc.mimeType, doc.name);
  const isVideo = doc.mimeType.startsWith("video/");
  /** .xlsx/.csv/.ods: se muestran como planilla en vez del cartel "sin vista previa". */
  const esHoja = esHojaLegible(doc.mimeType, doc.name);
  /** .docx/.txt/.md/.odt: se leen en el modal como documento. */
  const esTexto = esTextoLegible(doc.mimeType, doc.name);
  return { isPdf, isImage, imagenConvertible, esPresenta, isVideo, esHoja, esTexto };
}
export type TiposDoc = ReturnType<typeof tiposDeDoc>;
