"use client";

/**
 * El panel de vista previa del Archivo (Brandon 31-10: «al presionar un
 * documento, foto o PDF, ver al costado qué tiene»), como el de Windows
 * (Alt+P): un clic elige y el panel de la derecha lo muestra; el doble clic
 * sigue abriendo la ventana grande con todas sus pestañas.
 *
 * - Íconos grandes, medianos y lista: sigue a la selección del explorador, así
 *   las flechas del teclado pasan de un archivo al otro sin abrir nada.
 * - Tarjetas y Detalles: el clic que antes abría la ventana lo pone acá.
 * - Sólo desde 1280 px: más angosto no entra al lado de la lista y el clic
 *   abre la ventana como siempre.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { paraRepasarVencimiento } from "@/lib/documentos/parece-que-vence";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import { claveDoc } from "../explorador/contenido-explorador";
import { enOrden } from "../explorador/orden-agrupar";
import { esClaveCarpeta, idDeClave } from "../explorador/use-seleccion-explorador";
import type { HastaArchivoMenu } from "./use-archivo-menu";

export const PANEL_PREVIA_MIN = 300;
export const PANEL_PREVIA_MAX = 760;
export const PANEL_PREVIA_DEFAULT = 380;
const CLAVE_PRENDIDO = "doc-vista-previa";
const CLAVE_ANCHO = "doc-vista-previa-ancho";

export type ObjetivoPanel =
  | { tipo: "doc"; doc: DbDocument }
  | { tipo: "carpeta"; carpeta: DbDocumentFolder }
  | { tipo: "varios"; docs: DbDocument[]; carpetas: DbDocumentFolder[] }
  | { tipo: "nada" };

const ANCHO = "(min-width: 1280px)";
const suscribirAncho = (cb: () => void) => {
  const m = typeof window !== "undefined" ? window.matchMedia?.(ANCHO) : undefined;
  m?.addEventListener?.("change", cb);
  return () => m?.removeEventListener?.("change", cb);
};
const esAncho = () => !!window.matchMedia?.(ANCHO)?.matches;

function leer(clave: string): string | null {
  try { return window.localStorage.getItem(clave); } catch { return null; }
}
function guardar(clave: string, valor: string) {
  try { window.localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: dura hasta recargar */ }
}

export function usePanelVistaPrevia(previo: HastaArchivoMenu) {
  const { ex, filterMode, activeFolderId, view, setPreview, folderById, displayDocs, selectedIds, repasoVence, setRepasoHechas } = previo;
  const ancho = useSyncExternalStore(suscribirAncho, esAncho, () => false);
  // Prendido por defecto: es lo que pidió. Ver › Panel de vista previa (o Alt+P) lo apaga.
  const [prendido, setPrendido] = useState(() => leer(CLAVE_PRENDIDO) !== "0");
  const [anchoPanel, setAnchoPanel] = useState(() => {
    const n = Number(leer(CLAVE_ANCHO));
    return n >= PANEL_PREVIA_MIN && n <= PANEL_PREVIA_MAX ? n : PANEL_PREVIA_DEFAULT;
  });
  /** Lo elegido en Tarjetas/Detalles, atado al lugar: otra carpeta = panel vacío. */
  const lugar = `${filterMode}:${activeFolderId ?? ""}:${view}`;
  const [elegido, setElegido] = useState<{ id: string; lugar: string } | null>(null);

  const visible = ancho && prendido && filterMode !== "trash" && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode);
  const sel = ex.propsVista?.sel ?? null;
  const grupos = ex.propsVista?.grupos;

  /** Los archivos en el orden en que se ven (para ‹ y › del panel). */
  const ordenDocs = useMemo<DbDocument[]>(
    () => (grupos ? enOrden(grupos).flatMap((x) => (x.tipo === "doc" ? [x.doc] : [])) : displayDocs),
    [grupos, displayDocs],
  );

  const objetivo = useMemo<ObjetivoPanel>(() => {
    if (sel) {
      const claves = sel.efectiva;
      if (claves.length > 1) {
        const docs: DbDocument[] = [];
        const carpetas: DbDocumentFolder[] = [];
        for (const c of claves) {
          const id = idDeClave(c);
          if (esClaveCarpeta(c)) { const f = folderById.get(id); if (f) carpetas.push(f); }
          else { const d = ex.docPorId.get(id); if (d) docs.push(d); }
        }
        return { tipo: "varios", docs, carpetas };
      }
      const clave = claves[0];
      if (!clave) return { tipo: "nada" };
      const id = idDeClave(clave);
      if (esClaveCarpeta(clave)) {
        const f = folderById.get(id);
        return f ? { tipo: "carpeta", carpeta: f } : { tipo: "nada" };
      }
      const d = ex.docPorId.get(id);
      return d ? { tipo: "doc", doc: d } : { tipo: "nada" };
    }
    // Tarjetas y Detalles: varios marcados con la casilla = el resumen de todos.
    if (selectedIds.size > 1) {
      const docs = displayDocs.filter((d) => selectedIds.has(d.id));
      if (docs.length > 1) return { tipo: "varios", docs, carpetas: [] };
    }
    if (elegido && elegido.lugar === lugar) {
      // De la lista viva: si lo renombraste o lo moviste, el panel ya lo sabe.
      const d = ex.docPorId.get(elegido.id);
      if (d) return { tipo: "doc", doc: d };
    }
    return { tipo: "nada" };
  }, [sel, folderById, ex.docPorId, selectedIds, displayDocs, elegido, lugar]);

  /** Clic en una tarjeta o fila: al panel si está a la vista; si no, la ventana de siempre. */
  const mostrar = useCallback(
    (doc: DbDocument) => {
      if (visible) setElegido({ id: doc.id, lugar });
      else setPreview(doc);
    },
    [visible, lugar, setPreview],
  );

  const docActual = objetivo.tipo === "doc" ? objetivo.doc : null;
  const indice = docActual ? ordenDocs.findIndex((d) => d.id === docActual.id) : -1;
  const irA = useCallback(
    (doc: DbDocument) => {
      if (sel) sel.clic(claveDoc(doc.id));
      else setElegido({ id: doc.id, lugar });
    },
    [sel, lugar],
  );
  const anterior = indice > 0 ? () => irA(ordenDocs[indice - 1]) : undefined;
  const siguiente = indice >= 0 && indice < ordenDocs.length - 1 ? () => irA(ordenDocs[indice + 1]) : undefined;

  /**
   * Repaso de vencimientos: al empezar se prende el panel y se abre el primer
   * papel de la lista ya filtrada; «Anotar» / «Poner fecha» / «No vence» pasan
   * solos al siguiente (si era el último, al anterior).
   */
  const esperandoPrimero = useRef(false);
  const antesRepaso = useRef(false);
  useEffect(() => {
    if (repasoVence && !antesRepaso.current) { esperandoPrimero.current = true; setPrendido(true); }
    antesRepaso.current = repasoVence;
    if (!repasoVence) esperandoPrimero.current = false;
    // Espera a que la lista ya sea la filtrada (la vista del explorador la arma un render después).
    if (esperandoPrimero.current && ordenDocs.length > 0 && ordenDocs.every(paraRepasarVencimiento)) {
      esperandoPrimero.current = false;
      irA(ordenDocs[0]);
    }
  }, [repasoVence, ordenDocs, irA]);
  const avanzarRepaso = useCallback(
    (anotada: boolean) => {
      if (anotada) setRepasoHechas((n) => n + 1);
      const destino = indice >= 0 ? (ordenDocs[indice + 1] ?? ordenDocs[indice - 1]) : undefined;
      if (destino) irA(destino);
    },
    [indice, ordenDocs, irA, setRepasoHechas],
  );

  const alternar = useCallback(() => {
    setPrendido((v) => {
      guardar(CLAVE_PRENDIDO, v ? "0" : "1");
      return !v;
    });
  }, []);

  // Alt+P, como en Windows. `code` y no `key`: en algunos teclados Alt+P escribe «π».
  useEffect(() => {
    if (!ancho) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyP") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      alternar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ancho, alternar]);

  return {
    panelPrevia: {
      /** El panel se dibuja (pantalla ancha + prendido + una vista con archivos). */
      visible,
      /** Hay lugar para él: el menú Ver ofrece prenderlo. */
      disponible: ancho && filterMode !== "trash" && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode),
      prendido,
      alternar,
      objetivo,
      /** El id del archivo que se ve en el panel (para resaltarlo en la lista). */
      enPanelId: docActual?.id ?? null,
      mostrar,
      anterior,
      siguiente,
      avanzarRepaso,
      posicion: indice >= 0 ? { actual: indice + 1, total: ordenDocs.length } : null,
      ancho: anchoPanel,
      setAncho: setAnchoPanel,
      guardarAncho: (w: number) => guardar(CLAVE_ANCHO, String(w)),
    },
  };
}
