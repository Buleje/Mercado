import type { Cuadrilatero } from "@/lib/documentos/escaner/geometria";
import type { FiltroId } from "@/lib/documentos/escaner/filtros";

/** Una página del escaneo, con su recorte, rotación y filtro editables. */
export interface PaginaEscaner {
  /** Id estable para keys y reordenar. */
  id: string;
  /** La imagen original (cámara, subida o traída del drive). */
  origenBlob: Blob;
  /** Object URL de la original (para dibujarla en el editor de recorte). */
  origenUrl: string;
  /** Tamaño real de la original, en px. */
  ancho: number;
  alto: number;
  /** Recorte (cuadrilátero normalizado 0..1). Completo = sin recortar. */
  quad: Cuadrilatero;
  /** Rotación en grados: 0, 90, 180 o 270. */
  rotacion: number;
  /** Filtro aplicado. */
  filtro: FiltroId;
  /** Miniatura ya procesada (object URL); se regenera al editar. */
  miniaturaUrl: string | null;
}

export type PasoEscaner = "fuentes" | "editor" | "paginas";
