import { useState, useEffect, useRef, useId } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { reportarVelocidad } from "@/lib/documentos/reportar-velocidad";
import { getDocumentDetail, fetchVersions, fetchAudit, fetchShares } from "@/hooks/use-documents";
import { type DbDocument, type DbDocumentVersion, type DbDocumentAuditLog, type DbDocumentShare } from "@/lib/types/documents";
import type { Tab, Props } from "./tipos";

/** Teclas que el panel deja llegar al atajo de la ventana (cerrar y pasar de documento). */
export const TECLAS_DEL_VISOR = new Set(["Escape", "ArrowLeft", "ArrowRight"]);
/** Donde ← → ya significan otra cosa: ahí no se cambia de documento. */
export const CONTROLES_CON_FLECHAS = '[role="tree"], [role="treeitem"], [role="listbox"], [role="grid"], [role="slider"], [role="tablist"], [role="menu"], [role="radiogroup"]';

export function useVistaPrevia({ docId, onClose, allDocs, onPrev, onNext }: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [doc, setDoc] = useState<DbDocument | null>(null);
  const [versions, setVersions] = useState<DbDocumentVersion[]>([]);
  const [audit, setAudit] = useState<DbDocumentAuditLog[]>([]);
  const [shares, setShares] = useState<DbDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);
  /** Mandar ESTE archivo por WhatsApp sin volver a la grilla. */
  const [enviando, setEnviando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // El Escape ya lo maneja el listener global de abajo — acá sólo se pide el
  // foco atrapado y la semántica de diálogo.
  // `activo`: el primer render no tiene `doc` y devuelve otro árbol sin el ref.
  useModalAccesible(panelRef, { onCerrar: onClose, cerrarConEscape: false, activo: !!doc });
  const ventana = useVentanaDeModal(!!doc, { ref: panelRef, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "documento-vista-previa" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Ctrl/⌘+F con un documento abierto busca ADENTRO del documento, que es
      // lo que la persona quiere en ese momento (el del navegador sólo ve la
      // cáscara del visor). Se toma incluso desde un campo de texto.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setTab("texto");
        return;
      }
      // No navegar entre documentos si el usuario está escribiendo en un campo, ni
      // si las flechas ya son de otro control (árbol de carpetas, lista, pestañas).
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.closest?.(CONTROLES_CON_FLECHAS)) return;
      if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  // La lista ya tiene el documento: se muestra ESE de entrada y el detalle
  // completo (versiones, enlaces, permisos) llega después y lo reemplaza. Sin
  // esto, abrir o pasar al siguiente mostraba un "Cargando…" en cada paso
  // aunque el nombre, el tipo y el tamaño ya estuvieran a mano.
  useEffect(() => {
    let mounted = true;
    // El que se eligió en la columna del medio ya viene entero: se muestra al
    // instante en vez de un "Abriendo el documento…". Sin esto, elegir un
    // archivo de otra carpeta parpadeaba en blanco, porque el drive no lo
    // tenía cargado y había que esperar al servidor para dibujar hasta el
    // nombre.
    const conocido =
      allDocs?.find((d) => d.id === docId)
      ?? (elegidoRef.current?.id === docId ? elegidoRef.current : null);
    setDoc(conocido);
    setLoading(!conocido);
    const arranque = performance.now();
    getDocumentDetail(docId).then((r) => {
      if (!mounted) return;
      setDoc(r.document);
      setLoading(false);
      // Cuánto se espera para abrir un documento: es el otro momento donde la
      // gente mira la pantalla sin hacer nada, y hasta ahora sólo se medía
      // abrir el drive.
      reportarVelocidad("visor", performance.now() - arranque);
    }).catch(() => setLoading(false));
    return () => { mounted = false; };
  // `allDocs` cambia de identidad en cada render del padre; el id es lo que manda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  /** El documento que se acaba de elegir en el explorador, para no parpadear. */
  const elegidoRef = useRef<DbDocument | null>(null);
  /** Sube al mover un archivo: le avisa al explorador que su lista cambió. */
  const [revisionCarpeta, setRevisionCarpeta] = useState(0);

  /**
   * La carpeta que se está mirando en el explorador. Arranca donde vive el
   * documento abierto —que es de donde uno viene— pero después va por su
   * cuenta: podés estar leyendo un contrato y curiosear las facturas al lado
   * sin que el visor te devuelva al lugar de origen.
   */
  const [carpetaMirada, setCarpetaMirada] = useState<string | null>(
    () => allDocs?.find((d) => d.id === docId)?.folderId ?? null,
  );
  // Al saltar a un documento de OTRA carpeta (un "parecido", o el prev/next),
  // el explorador lo acompaña. Pero si el salto salió de la columna del medio,
  // NO: ahí ya estás parado donde querés estar, y moverte la carpeta debajo de
  // los pies es exactamente lo contrario de lo que pediste.
  useEffect(() => {
    if (elegidoRef.current?.id === docId) return;
    const destino = allDocs?.find((d) => d.id === docId)?.folderId ?? null;
    setCarpetaMirada(destino);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Vista previa same-origin: servimos el archivo desde nuestro proxy (/raw) en vez
  // de iframear la URL firmada de Supabase directamente (llegaba con X-Frame-Options
  // → "contenido bloqueado"). El proxy es same-origin, así que la CSP `frame-src 'self'`
  // lo permite y las cookies autentican el GET.
  const rawUrl = `/api/admin/documents/${docId}/raw`;
  // La grilla ya pidió esta miniatura, así que sale de la caché del navegador:
  // sirve de vista previa instantánea mientras se lee el archivo completo.
  const miniaturaUrl = urlMiniatura(docId);

  // Lazy load por tab
  useEffect(() => {
    if (tab === "versions") fetchVersions(docId).then(setVersions);
    if (tab === "audit") fetchAudit(docId).then(setAudit);
    if (tab === "share") fetchShares(docId).then(setShares);
  }, [tab, docId]);
  return {
    docId, tab, setTab, doc, setDoc, versions, setVersions, audit, setAudit, shares, setShares, loading,
    enviando, setEnviando, panelRef, titleId, ventana, elegidoRef, revisionCarpeta, setRevisionCarpeta,
    carpetaMirada, setCarpetaMirada, rawUrl, miniaturaUrl,
  };
}
export type EstadoVistaPrevia = ReturnType<typeof useVistaPrevia>;
