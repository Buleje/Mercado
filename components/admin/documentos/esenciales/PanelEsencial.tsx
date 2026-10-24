"use client";

import { useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  ChevronsLeft, ChevronsRight, Download, Eye, FileArchive, FolderOpen, Loader2, Lock, Maximize2, MessageCircle, Palette, ScanLine, Share2, StarOff, Upload, UserPlus, X,
} from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { masAbiertos, type CarpetaEsencial, type UsoDoc } from "@/lib/documentos/esenciales";
import { esTagDeVinculo, vinculosDeCarpeta, type OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import { FolderGlyph } from "../folder-visuals";
import { formatBytes, getFileIcon } from "../archivo-visual";
import { tagsVisibles } from "../archivo/compartido";
import type { ModeloArchivo } from "../archivo/use-archivo";
import ContenidoEsencial from "./ContenidoEsencial";
import DetallePapelEsencial from "./DetallePapelEsencial";
import { useAltoDelScroll, useAnchoDelContenedor } from "./medidas-y-url";
import type { MedidaPanelEsencial } from "./use-ancho-panel-esencial";
import LeerPapeles from "./LeerPapeles";
import LigadaA from "./LigadaA";
import MovimientosCarpeta from "./MovimientosCarpeta";
import { archivosSoltados, subirACarpeta, traeArchivos } from "./subir-a-carpeta";
import { haceCuanto, papeles, quienLaVe, veces } from "./compartido";

/**
 * El panel al costado de Esenciales: la carpeta elegida con sus detalles
 * (cuánto tiene, cuánto se usa, quién la ve, lo que vence), lo que más se abre
 * y su contenido para navegar sin salir de la pestaña.
 *
 * Ancho (Brandon 24-10, «Más ancho» o arrastrando el borde): desde 38rem va en
 * dos columnas, el árbol y los papeles a la izquierda y a la derecha el papel
 * que eliges (o, sin elegir, los detalles de la carpeta). Angosto, como siempre.
 */
/** Ancho de adentro (38rem del panel menos su relleno) desde el que van dos columnas. */
const DOS_COLUMNAS_DESDE = 576;

export default function PanelEsencial({ e, dentroDe, setDentroDe, orden, setOrden, abrir, arch, uso, ahora, medida, onCerrar, onAbrirEnArchivo, onQuitar, onAmpliar, onEscanear, onCambiarIcono }: {
  e: CarpetaEsencial<DbDocumentFolder>;
  /** La carpeta que se mira adentro (la esencial o una de sus subcarpetas). Vive en la vista:
   *  al pasar del costado al cajón (girar la tableta) el panel se vuelve a montar y no se pierde. */
  dentroDe: string;
  setDentroDe: (id: string) => void;
  orden: OrdenDocsTercero;
  setOrden: (o: OrdenDocsTercero) => void;
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  arch: ModeloArchivo;
  uso: Record<string, UsoDoc>;
  ahora: number;
  /** El botón «Más ancho / Más angosto» (sólo en la columna derecha o en el cajón). */
  medida?: Pick<MedidaPanelEsencial, "amplio" | "alternar">;
  onCerrar: () => void;
  onAbrirEnArchivo: (carpetaId: string) => void;
  onQuitar: (f: DbDocumentFolder) => void;
  /** «Ver en grande»: la carpeta a todo el ancho de Esenciales (árbol, papeles y detalles). */
  onAmpliar?: () => void;
  /** «Escanear aquí»: guarda lo escaneado en la carpeta que se está mirando. */
  onEscanear?: (f: DbDocumentFolder) => void;
  /** «Cambiar ícono» de la carpeta esencial. */
  onCambiarIcono?: (f: DbDocumentFolder) => void;
}) {
  const f = e.carpeta;
  const { documents, folderById, upload, setSharingFolder, setExpediente, setVinculando, setWhatsappDoc, zipAndDownload } = arch;
  const [subiendo, setSubiendo] = useState(false);
  const [archivoEncima, setArchivoEncima] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const destino = folderById.get(dentroDe) ?? f;
  const [refPanel, anchoPanel] = useAnchoDelContenedor();
  const [refLado, altoScroll] = useAltoDelScroll();
  const dosColumnas = anchoPanel >= DOS_COLUMNAS_DESDE;
  // El papel elegido vale para la carpeta en que lo elegiste: al moverte por el árbol, vuelven los de la carpeta.
  const [sel, setSel] = useState<{ id: string; lista: readonly DbDocument[]; en: string } | null>(null);
  const papel = dosColumnas && sel?.en === dentroDe ? (documents.find((d) => d.id === sel.id && !d.deletedAt) ?? null) : null;

  const todos = useMemo(
    () => documents.filter((d) => !d.deletedAt && !!d.folderId && e.carpetaIds.has(d.folderId)),
    [documents, e.carpetaIds],
  );
  const destacados = useMemo(() => masAbiertos(todos, uso, 3), [todos, uso]);
  const acceso = quienLaVe(f.allowedRoles);
  const etiquetas = tagsVisibles(f.tags).filter((t) => !esTagDeVinculo(t));
  const terceros = vinculosDeCarpeta(f).length;
  const nombreZip = f.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "carpeta";

  const subir = async (archivos: File[], carpetasSueltas = 0) => {
    setSubiendo(true);
    await subirACarpeta(upload, archivos, destino, carpetasSueltas);
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const datos: [string, string][] = [
    ["Papeles", papeles(e.docs)],
    ["Tamaño", e.bytes > 0 ? formatBytes(e.bytes) : "—"],
    ["Aperturas (90 días)", e.vistas > 0 ? veces(e.vistas) : "Ninguna"],
    ["Último movimiento", haceCuanto(e.ultima, ahora) ?? "—"],
    ["Quién la ve", acceso.texto],
    ["Creada", formatDate(f.createdAt)],
  ];

  const detallesCarpeta = (
    <>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
        {datos.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-[var(--text-tertiary)]">{k}</dt>
            <dd className="flex items-center gap-1 truncate font-bold text-[var(--text-primary)]">
              {k === "Quién la ve" && acceso.cerrada && <Lock className="h-4 w-4 shrink-0" />}
              <span className="truncate">{v}</span>
            </dd>
          </div>
        ))}
        {(e.vencidos > 0 || e.porVencer > 0) && (
          <div className="col-span-2 text-xs font-bold">
            {e.vencidos > 0 && <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{e.vencidos} vencido{e.vencidos === 1 ? "" : "s"}</span>}
            {e.vencidos > 0 && e.porVencer > 0 && <span className="text-[var(--text-tertiary)]"> · </span>}
            {e.porVencer > 0 && <span className="text-[var(--data-warning-ink)]">{e.porVencer} vence{e.porVencer === 1 ? "" : "n"} en 30 días</span>}
          </div>
        )}
        {etiquetas.length > 0 && (
          <div className="col-span-2 flex flex-wrap gap-1">
            {etiquetas.map((t) => (
              <span key={t} className="rounded-lg bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">#{t}</span>
            ))}
          </div>
        )}
      </dl>

      {/* A quién está ligada (antes una pastilla «N terceros»): con su nombre y lo que tiene en los otros módulos. */}
      <LigadaA carpeta={f} onLigar={() => setVinculando(f)} />
      <LeerPapeles docs={todos} arch={arch} />

      {destacados.length > 0 && (
        <section className="space-y-2" aria-label="Lo que más abres aquí">
          <CardTitle>Lo que más abres aquí</CardTitle>
          <ul className="grid gap-2">
            {destacados.map((doc) => {
              const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
              return (
                <li key={doc.id}>
                  <button type="button" onClick={() => abrir(doc, destacados)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-left hover:border-[var(--accent)]">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                      <Icon className={cn("h-5 w-5", tint)} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-[var(--text-tertiary)]">
                      <Eye className="h-4 w-4" /> {uso[doc.id]?.vistas ?? 0}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <MovimientosCarpeta carpetaId={f.id} marca={`${todos.length}:${e.ultima ?? ""}`} documentos={documents} abrir={abrir} ahora={ahora} />
    </>
  );
  const contenido = (
    <ContenidoEsencial
      raiz={f}
      dentroDe={dentroDe}
      setDentroDe={setDentroDe}
      orden={orden}
      setOrden={setOrden}
      abrir={abrir}
      elegir={dosColumnas ? (doc, lista) => setSel({ id: doc.id, lista, en: dentroDe }) : undefined}
      elegidoId={papel?.id ?? null}
      arch={arch}
    />
  );

  return (
    <div
      ref={refPanel}
      data-dos-columnas={dosColumnas ? 1 : 0}
      className={cn("relative flex min-h-0 flex-col gap-4 rounded-xl", archivoEncima && "outline-dashed outline-2 outline-offset-4 outline-[var(--accent)]")}
      data-qa="esencial-panel"
      // Soltar archivos sobre el panel: van a la carpeta que se está mirando (la esencial o su subcarpeta).
      onDragOver={(ev) => { if (!traeArchivos(ev)) return; ev.preventDefault(); ev.stopPropagation(); setArchivoEncima(true); }}
      onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setArchivoEncima(false); }}
      onDrop={(ev) => {
        if (!traeArchivos(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        setArchivoEncima(false);
        const { archivos, carpetas } = archivosSoltados(ev);
        void subir(archivos, carpetas);
      }}
    >
      {archivoEncima && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 z-10 mx-auto w-fit rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--text-inverse)] shadow-[var(--shadow-lg)]">
          Suelta para subir a «{destino.name}»
        </p>
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-2xl">
          <FolderGlyph folder={f} active className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{f.name}</CardTitle>
          <p className="truncate text-xs text-[var(--text-tertiary)]">{e.ruta.length > 0 ? `en ${e.ruta.join(" › ")}` : "en la raíz del Archivo"}</p>
        </div>
        {medida && (
          <button
            type="button"
            onClick={medida.alternar}
            title={medida.amplio ? "Más angosto" : "Más ancho: los papeles con sus detalles al lado"}
            aria-label={medida.amplio ? "Hacer el panel más angosto" : "Hacer el panel más ancho"}
            aria-pressed={medida.amplio}
            className={button({ variant: "ghost", size: "icon" })}
            data-qa="esencial-ancho"
          >
            {medida.amplio ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        )}
        {onAmpliar && (
          <button type="button" onClick={onAmpliar} title="Ver en grande" aria-label="Ver la carpeta en grande" className={button({ variant: "ghost", size: "icon" })} data-qa="esencial-ampliar">
            <Maximize2 className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={onCerrar} aria-label="Cerrar el panel" className={button({ variant: "ghost", size: "icon" })}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAbrirEnArchivo(dentroDe)} className={cn(button({ variant: "primary" }), "flex-1 gap-2")}>
          <FolderOpen className="h-4 w-4" /> Abrir en el Archivo
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo} className={cn(button({ variant: "secondary" }), "gap-2")}>
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir aquí
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={(ev) => void subir(Array.from(ev.target.files ?? []))} />
        <ActionMenu
          label="Más acciones"
          soloIcono
          size="md"
          actions={[
            ...(onEscanear ? [{ id: "escanear", label: "Escanear aquí", hint: `Queda en «${destino.name}»`, icon: ScanLine, onSelect: () => onEscanear(destino) }] : []),
            ...(onCambiarIcono ? [{ id: "icono", label: "Cambiar ícono", icon: Palette, onSelect: () => onCambiarIcono(f) }] : []),
            { id: "zip", label: "Descargar todo (ZIP)", icon: Download, disabled: todos.length === 0, onSelect: () => void zipAndDownload(todos, `${nombreZip}.zip`) },
            { id: "expediente", label: "Armar expediente PDF", hint: "La carpeta en un PDF con carátula e índice", icon: FileArchive, disabled: todos.length === 0, onSelect: () => setExpediente({ tipo: "carpeta", folderId: f.id, nombre: f.name }) },
            { id: "whatsapp", label: "Enviar por WhatsApp", icon: MessageCircle, disabled: todos.length === 0, onSelect: () => setWhatsappDoc(todos) },
            { id: "compartir", label: "Compartir carpeta", icon: Share2, onSelect: () => setSharingFolder(f) },
            { id: "terceros", label: terceros > 0 ? "Terceros vinculados…" : "Vincular a un tercero…", icon: UserPlus, onSelect: () => setVinculando(f) },
            { id: "quitar", label: "Quitar de Esenciales", icon: StarOff, onSelect: () => onQuitar(f) },
          ]}
        />
      </div>

      {dosColumnas ? (
        <div className="grid grid-cols-2 items-start gap-4">
          {contenido}
          {/* Fija arriba mientras bajas por la lista, con el alto que se ve: el papel elegido no se pierde de vista. */}
          <div ref={refLado} className="sticky top-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain" style={altoScroll > 0 ? { maxHeight: altoScroll } : undefined} data-qa="esencial-lado">
            {papel ? (
              <DetallePapelEsencial
                doc={papel}
                donde={papel.folderId ? (folderById.get(papel.folderId)?.name ?? null) : null}
                uso={uso}
                ahora={ahora}
                arch={arch}
                onAbrir={() => abrir(papel, sel?.lista ?? [papel])}
                onCerrar={() => setSel(null)}
              />
            ) : detallesCarpeta}
          </div>
        </div>
      ) : (
        <>
          {detallesCarpeta}
          {contenido}
        </>
      )}
    </div>
  );
}
