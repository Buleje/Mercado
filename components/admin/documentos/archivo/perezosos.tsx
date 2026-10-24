"use client";
/**
 * Lo que el Archivo NO dibuja al abrir: las ventanas (vista previa, mover,
 * escanear, expediente, ordenar…) y las vistas secundarias del panel
 * (Papelera, Calendario, Actividad, Duplicados, Sincronización, Enlaces…).
 *
 * Antes entraban todas con la primera apertura aunque ninguna estuviera a la
 * vista: el navegador bajaba y evaluaba su código antes de pintar la primera
 * tarjeta (Brandon 23-10: «Archivo más liviano»). Ahora cada una entra por
 * `import()` y se pide por adelantado cuando el mouse (o el dedo, o el foco)
 * pasa por la zona que la abre: la cabecera, el panel de carpetas, la lista
 * de documentos o el botón de la vista. Los `import()` se deduplican solos y
 * `precargarArchivo` recuerda lo pedido, así que pasar el mouse cien veces no
 * cuesta nada. Mismo criterio que `../precargar-visores.ts` para los visores.
 */
import dynamic from "next/dynamic";
import { logger } from "@/lib/logger";

/** Lo mismo que dibuja el Archivo mientras trae la lista (una sola caja). */
export function CargandoVista() {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-10 text-center text-sm text-[var(--text-tertiary)]">
      Cargando…
    </div>
  );
}
const cargandoVista = () => <CargandoVista />;

// Los especificadores repiten los de cada `dynamic` de abajo a propósito: el
// bundler arma un chunk por módulo y los dos caminos piden el mismo.
const CARGAS = {
  plantillas: () => import("../TemplateGenerator"),
  mover: () => import("../MoveToFolderModal"),
  importar: () => import("../ImportarCarpetaModal"),
  whatsapp: () => import("../SendWhatsAppModal"),
  ordenar: () => import("../OrdenarArchivoModal"),
  expediente: () => import("../ExpedienteModal"),
  sello: () => import("../StampModal"),
  escaner: () => import("../escaner/EscanerModal"),
  paginas: () => import("../PageEditorModal"),
  inteligente: () => import("../SmartFolderModal"),
  editarCarpeta: () => import("../esenciales/IconoCarpetaModal"),
  compartirCarpeta: () => import("../FolderShareModal"),
  borrarCarpetas: () => import("../ConfirmarBorrarCarpetas"),
  etiquetas: () => import("../TagTaxonomyModal"),
  etiquetarVarios: () => import("../BulkTagModal"),
  etiqueta: () => import("../TagEditModal"),
  vistaPrevia: () => import("../DocumentPreviewModal"),
  vincular: () => import("../terceros/VincularTerceroModal"),
  // Las vistas, con la clave del `?sub=` que las abre (VistasDelPanel pasa `cat.id`).
  assistant: () => import("../AssistantView"),
  dashboard: () => import("../DashboardView"),
  calendar: () => import("../CalendarView"),
  activity: () => import("../ActivityView"),
  enlaces: () => import("../EnlacesView"),
  sync: () => import("../SyncEscritorioView"),
  duplicados: () => import("../DuplicadosView"),
  trash: () => import("../PapeleraView"),
  terceros: () => import("../terceros/VistaTerceros"),
} as const;

const pedidas = new Set<string>();

/** Pide por adelantado esas piezas; las claves que no son perezosas («all», «favorites») no hacen nada. */
export function precargarArchivo(...piezas: readonly string[]): void {
  if (typeof window === "undefined") return;
  for (const p of piezas) {
    if (pedidas.has(p) || !Object.hasOwn(CARGAS, p)) continue;
    pedidas.add(p);
    CARGAS[p as keyof typeof CARGAS]().catch((err: unknown) => {
      // Precargar es una mejora: si falla, la pieza se pide igual al abrirla.
      pedidas.delete(p);
      logger.warn("[archivo] no se pudo precargar una pieza", { pieza: p, error: String(err) });
    });
  }
}

/** Lo que se abre desde la fila de botones de la cabecera (Escanear, Plantilla, Importar, Ordenar). */
export const DE_LA_CABECERA = ["escaner", "plantillas", "importar", "ordenar"] as const;
/** Lo que se abre desde un documento (clic, «⋯», clic derecho) o desde la barra de seleccionados. */
export const DE_LOS_DOCUMENTOS = [
  "vistaPrevia", "mover", "whatsapp", "expediente", "etiquetarVarios", "etiqueta", "sello", "paginas",
] as const;
/** Lo que se abre desde el panel de carpetas (editar, compartir, borrar, etiquetas, carpeta inteligente). */
export const DEL_PANEL = ["editarCarpeta", "compartirCarpeta", "borrarCarpetas", "etiquetas", "inteligente", "vincular"] as const;

// ── Ventanas: sin `loading` (están cerradas hasta que algo las abre) ──
export const TemplateGenerator = dynamic(() => import("../TemplateGenerator").then((m) => m.TemplateGenerator), { ssr: false });
export const MoveToFolderModal = dynamic(() => import("../MoveToFolderModal").then((m) => m.MoveToFolderModal), { ssr: false });
export const ImportarCarpetaModal = dynamic(() => import("../ImportarCarpetaModal"), { ssr: false });
export const SendWhatsAppModal = dynamic(() => import("../SendWhatsAppModal").then((m) => m.SendWhatsAppModal), { ssr: false });
export const OrdenarArchivoModal = dynamic(() => import("../OrdenarArchivoModal").then((m) => m.OrdenarArchivoModal), { ssr: false });
export const ExpedienteModal = dynamic(() => import("../ExpedienteModal").then((m) => m.ExpedienteModal), { ssr: false });
export const StampModal = dynamic(() => import("../StampModal").then((m) => m.StampModal), { ssr: false });
export const EscanerModal = dynamic(() => import("../escaner/EscanerModal").then((m) => m.EscanerModal), { ssr: false });
export const PageEditorModal = dynamic(() => import("../PageEditorModal").then((m) => m.PageEditorModal), { ssr: false });
export const SmartFolderModal = dynamic(() => import("../SmartFolderModal").then((m) => m.SmartFolderModal), { ssr: false });
export const IconoCarpetaModal = dynamic(() => import("../esenciales/IconoCarpetaModal"), { ssr: false });
export const FolderShareModal = dynamic(() => import("../FolderShareModal").then((m) => m.FolderShareModal), { ssr: false });
export const ConfirmarBorrarCarpetas = dynamic(() => import("../ConfirmarBorrarCarpetas").then((m) => m.ConfirmarBorrarCarpetas), { ssr: false });
export const TagTaxonomyModal = dynamic(() => import("../TagTaxonomyModal").then((m) => m.TagTaxonomyModal), { ssr: false });
export const BulkTagModal = dynamic(() => import("../BulkTagModal").then((m) => m.BulkTagModal), { ssr: false });
export const TagEditModal = dynamic(() => import("../TagEditModal").then((m) => m.TagEditModal), { ssr: false });
export const DocumentPreviewModal = dynamic(() => import("../DocumentPreviewModal").then((m) => m.DocumentPreviewModal), { ssr: false });
export const VincularTerceroModal = dynamic(() => import("../terceros/VincularTerceroModal"), { ssr: false });

// ── Vistas del panel: mientras baja su código, la misma caja «Cargando…» de la lista ──
export const AssistantView = dynamic(() => import("../AssistantView").then((m) => m.AssistantView), { ssr: false, loading: cargandoVista });
export const DashboardView = dynamic(() => import("../DashboardView").then((m) => m.DashboardView), { ssr: false, loading: cargandoVista });
export const CalendarView = dynamic(() => import("../CalendarView").then((m) => m.CalendarView), { ssr: false, loading: cargandoVista });
export const ActivityView = dynamic(() => import("../ActivityView").then((m) => m.ActivityView), { ssr: false, loading: cargandoVista });
export const EnlacesView = dynamic(() => import("../EnlacesView").then((m) => m.EnlacesView), { ssr: false, loading: cargandoVista });
export const SyncEscritorioView = dynamic(() => import("../SyncEscritorioView"), { ssr: false, loading: cargandoVista });
export const DuplicadosView = dynamic(() => import("../DuplicadosView"), { ssr: false, loading: cargandoVista });
export const PapeleraView = dynamic(() => import("../PapeleraView").then((m) => m.PapeleraView), { ssr: false, loading: cargandoVista });
export const VistaTerceros = dynamic(() => import("../terceros/VistaTerceros"), { ssr: false, loading: cargandoVista });
