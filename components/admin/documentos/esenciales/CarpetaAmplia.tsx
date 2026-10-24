"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, ChevronLeft, Download, FileArchive, FolderOpen, MessageCircle, Share2, StarOff, UserPlus } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { CarpetaEsencial, UsoDoc } from "@/lib/documentos/esenciales";
import { aplanar, armarArbol, caminoHasta, idsAMover, idsDeLaRama, nodoDe, papelesDeLaVista, textoMovidos } from "@/lib/documentos/arbol-esencial";
import { ordenarDocsTercero, vinculosDeCarpeta, type OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import { FolderGlyph } from "../folder-visuals";
import type { ModeloArchivo } from "../archivo/use-archivo";
import ArbolEsencial from "./ArbolEsencial";
import CarpetaAmpliaBarra, { type ModoPapeles } from "./CarpetaAmpliaBarra";
import CarpetaAmpliaDetalles from "./CarpetaAmpliaDetalles";
import CarpetaAmpliaPapeles from "./CarpetaAmpliaPapeles";
import { archivosSoltados, subirACarpeta, traeArchivos } from "./subir-a-carpeta";
import { useAnchoDelContenedor } from "./medidas-y-url";
import CarpetaAmpliaRiel from "./CarpetaAmpliaRiel";

/**
 * Entre estos anchos de la sección (a 1280 de pantalla mide ~964) el árbol se
 * pliega en una franja de 48 px y los detalles quedan AL COSTADO, no debajo
 * (Brandon 23-10: «detalles al costado también a 1280»). Desde 1100, árbol entero.
 */
const ANCHO_RIEL = 880;
const ANCHO_TRES = 1100;

const nombreDeArchivo = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "carpeta";

/**
 * La carpeta esencial a todo el ancho (Brandon 23-10: «que se vean los detalles de la
 * carpeta más completo y amplio para que se maneje mejor»): a la izquierda el árbol
 * entero con sus cuentas, al centro los papeles de la carpeta mirada (arrastrables al
 * árbol) y a la derecha sus detalles. Por debajo de 1100 px los detalles bajan debajo
 * de los papeles; en el celular, una sola columna con el árbol plegable arriba.
 */
export default function CarpetaAmplia({ e, arch, uso, ahora, dentroDe, setDentroDe, orden, setOrden, abrir, onVolver, onAbrirEnArchivo, onQuitar, accionesExtra }: {
  e: CarpetaEsencial<DbDocumentFolder>;
  arch: ModeloArchivo;
  uso: Record<string, UsoDoc>;
  ahora: number;
  /** La carpeta que se mira (la esencial o una subcarpeta). Vive en la vista. */
  dentroDe: string;
  setDentroDe: (id: string) => void;
  orden: OrdenDocsTercero;
  setOrden: (o: OrdenDocsTercero) => void;
  /** Abre la vista previa con las flechas por esa lista. */
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  onVolver: () => void;
  onAbrirEnArchivo: (carpetaId: string) => void;
  onQuitar: (f: DbDocumentFolder) => void;
  /** Hueco para un botón de quien la monta («Leer los papeles»): va en la barra de acciones. */
  accionesExtra?: React.ReactNode;
}) {
  const f = e.carpeta;
  const { folders, documents, folderById, upload, bulk, setSharingFolder, setExpediente, setVinculando, setWhatsappDoc, zipAndDownload } = arch;
  const [q, setQ] = useState("");
  const [incluirSub, setIncluirSub] = useState(true);
  const [modo, setModo] = useLocalStorage<ModoPapeles>("documentos-esenciales-modo-papeles", "lista");
  const [sel, setSel] = useState<ReadonlySet<string>>(() => new Set());
  const [arbolAbierto, setArbolAbierto] = useState(false);
  const [refSeccion, anchoSeccion] = useAnchoDelContenedor();
  const enRiel = anchoSeccion >= ANCHO_RIEL && anchoSeccion < ANCHO_TRES;
  // En la franja, el árbol se abre encima de la tabla y se cierra al elegir.
  const [arbolFlotante, setArbolFlotante] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [archivoEncima, setArchivoEncima] = useState(false);

  const vivos = useMemo(() => documents.filter((d) => !d.deletedAt), [documents]);
  const arbol = useMemo(() => armarArbol(f, folders, vivos), [f, folders, vivos]);
  const mirada = nodoDe(arbol, dentroDe) ?? arbol;
  const destino = mirada.carpeta;
  const camino = useMemo(() => caminoHasta(arbol, destino.id), [arbol, destino.id]);
  const opcionesMover = useMemo(() => aplanar(arbol), [arbol]);
  const todos = useMemo(() => {
    const ids = idsDeLaRama(arbol);
    return vivos.filter((d) => !!d.folderId && ids.has(d.folderId));
  }, [arbol, vivos]);
  const lista = useMemo(
    () => ordenarDocsTercero(papelesDeLaVista({ arbol, docs: vivos, dentroDe: destino.id, incluirSubcarpetas: incluirSub, q }), orden),
    [arbol, vivos, destino.id, incluirSub, q, orden],
  );
  const elegidos = useMemo(() => lista.filter((d) => sel.has(d.id)), [lista, sel]);
  const terceros = vinculosDeCarpeta(f).length;
  const nombreZip = nombreDeArchivo(f.name);

  const irA = (id: string) => {
    setDentroDe(id);
    setSel(new Set());
  };

  const mover = async (ids: string[], folderId: string) => {
    const a = folderById.get(folderId);
    if (!a) return;
    const reales = idsAMover(ids, vivos, folderId);
    if (reales.length === 0) {
      toast.info(ids.length === 1 ? `Ya está en «${a.name}».` : `Ya están en «${a.name}».`);
      return;
    }
    try {
      await bulk("move", reales, { folderId });
      toast.success(textoMovidos(reales.length, a.name));
      setSel(new Set());
    } catch (err) {
      logger.warn("[documentos.esenciales] mover falló", { error: String(err) });
      toast.error(err instanceof Error ? err.message : "No se pudo mover. Prueba de nuevo.");
    }
  };

  const subir = async (archivos: File[], carpetasSueltas: number, a: DbDocumentFolder) => {
    setSubiendo(true);
    await subirACarpeta(upload, archivos, a, carpetasSueltas);
    setSubiendo(false);
  };
  const subirSoltado = (ev: React.DragEvent, a: DbDocumentFolder) => {
    const { archivos, carpetas } = archivosSoltados(ev);
    void subir(archivos, carpetas, a);
  };

  return (
    <section ref={refSeccion} className="@container space-y-4" aria-label={`Carpeta ${f.name}`} data-qa="carpeta-amplia" data-riel={enRiel ? 1 : 0}>
      <header className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className={cn(button({ variant: "ghost" }), "gap-1 px-3")} data-qa="amplia-volver">
          <ChevronLeft className="h-5 w-5" />
          <span className="max-sm:sr-only">Volver a Esenciales</span>
        </button>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-2xl">
          <FolderGlyph folder={f} active className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-[1_1_12rem]">
          <CardTitle className="truncate">{f.name}</CardTitle>
          <p className="truncate text-xs text-[var(--text-tertiary)]">{e.ruta.length > 0 ? `en ${e.ruta.join(" › ")}` : "en la raíz del Archivo"}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onAbrirEnArchivo(destino.id)} className={cn(button({ variant: "primary" }), "gap-2")}>
            <FolderOpen className="h-4 w-4" /> Abrir en el Archivo
          </button>
          {accionesExtra}
          <ActionMenu
            label="Más acciones"
            soloIcono
            size="md"
            actions={[
              { id: "zip", label: "Descargar todo (ZIP)", icon: Download, disabled: todos.length === 0, onSelect: () => void zipAndDownload(todos, `${nombreZip}.zip`) },
              { id: "expediente", label: "Armar expediente PDF", hint: "La carpeta en un PDF con carátula e índice", icon: FileArchive, disabled: todos.length === 0, onSelect: () => setExpediente({ tipo: "carpeta", folderId: f.id, nombre: f.name }) },
              { id: "whatsapp", label: "Enviar por WhatsApp", icon: MessageCircle, disabled: todos.length === 0, onSelect: () => setWhatsappDoc(todos) },
              { id: "compartir", label: "Compartir carpeta", icon: Share2, onSelect: () => setSharingFolder(f) },
              { id: "terceros", label: terceros > 0 ? "Terceros vinculados…" : "Vincular a un tercero…", icon: UserPlus, onSelect: () => setVinculando(f) },
              { id: "quitar", label: "Quitar de Esenciales", icon: StarOff, onSelect: () => onQuitar(f) },
            ]}
          />
        </div>
      </header>

      <div // 3 columnas desde 1100 px; con la franja del árbol desde 880; 2 desde 640 px; 1 en el celular.
        className={cn(
          "grid gap-4",
          enRiel
            ? "grid-cols-[3rem_minmax(0,1fr)_18rem]"
            : "@min-[40rem]:grid-cols-[16rem_minmax(0,1fr)] @min-[68.75rem]:grid-cols-[16rem_minmax(0,1fr)_20rem]",
        )}>
        {/* El árbol queda a la vista al bajar por una lista larga: hay que poder soltar encima. */}
        {enRiel ? (
          <CarpetaAmpliaRiel abierto={arbolFlotante} setAbierto={setArbolFlotante} donde={destino.name}>
            <ArbolEsencial
              raiz={f}
              carpetas={folders}
              docs={vivos}
              elegida={destino.id}
              onElegir={(id) => { irA(id); setArbolFlotante(false); }}
              onMoverDocs={(ids, id) => void mover(ids, id)}
              onSoltarArchivos={(id, ev) => {
                const a = folderById.get(id);
                if (a) subirSoltado(ev, a);
              }}
            />
          </CarpetaAmpliaRiel>
        ) : (
        <aside
          aria-label="Subcarpetas"
          className={cn(
            "min-w-0 @min-[40rem]:sticky @min-[40rem]:top-4 @min-[40rem]:row-span-2 @min-[40rem]:max-h-[calc(100dvh-2rem)] @min-[40rem]:self-start @min-[40rem]:overflow-y-auto",
            "@min-[68.75rem]:row-span-1",
          )}
        >
          <button
            type="button"
            onClick={() => setArbolAbierto((v) => !v)}
            aria-expanded={arbolAbierto}
            aria-controls="amplia-arbol"
            className={cn(button({ variant: "secondary" }), "w-full justify-between gap-2 @min-[40rem]:hidden")}
            data-qa="amplia-arbol-plegar"
          >
            <span className="min-w-0 truncate">Carpetas · {destino.name}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-[rotate] motion-reduce:transition-none", arbolAbierto && "rotate-180")} />
          </button>
          <div
            id="amplia-arbol"
            className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 mt-2 @min-[40rem]:mt-0", arbolAbierto ? "block" : "hidden", "@min-[40rem]:block")}
          >
            <ArbolEsencial
              raiz={f}
              carpetas={folders}
              docs={vivos}
              elegida={destino.id}
              onElegir={irA}
              onMoverDocs={(ids, id) => void mover(ids, id)}
              onSoltarArchivos={(id, ev) => {
                const a = folderById.get(id);
                if (a) subirSoltado(ev, a);
              }}
            />
          </div>
        </aside>
        )}

        <div
          className={cn("@container relative min-w-0 space-y-3 rounded-xl", archivoEncima && "outline-dashed outline-2 outline-offset-4 outline-[var(--accent)]")}
          data-qa="amplia-centro"
          // Archivos del disco soltados sobre los papeles: van a la carpeta mirada.
          onDragOver={(ev) => { if (!traeArchivos(ev)) return; ev.preventDefault(); ev.stopPropagation(); setArchivoEncima(true); }}
          onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setArchivoEncima(false); }}
          onDrop={(ev) => {
            if (!traeArchivos(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            setArchivoEncima(false);
            subirSoltado(ev, destino);
          }}
        >
          {archivoEncima && (
            <p className="pointer-events-none absolute inset-x-0 top-24 z-10 mx-auto w-fit rounded-xl bg-[var(--accent-dark)] px-4 py-2 text-sm font-bold text-[var(--text-inverse)] shadow-[var(--shadow-lg)]">
              Suelta para subir a «{destino.name}»
            </p>
          )}
          <CarpetaAmpliaBarra
            camino={camino}
            irA={irA}
            raiz={f}
            q={q}
            setQ={setQ}
            orden={orden}
            setOrden={setOrden}
            modo={modo}
            setModo={setModo}
            incluirSub={incluirSub}
            setIncluirSub={setIncluirSub}
            tieneSubcarpetas={mirada.hijos.length > 0}
            total={lista.length}
            subiendo={subiendo}
            onSubir={(archivos) => void subir(archivos, 0, destino)}
            elegidos={elegidos}
            opcionesMover={opcionesMover}
            onMover={(folderId) => void mover(elegidos.map((d) => d.id), folderId)}
            onZip={() => void zipAndDownload(elegidos, `${nombreZip}-elegidos.zip`)}
            onLimpiar={() => setSel(new Set())}
          />
          <CarpetaAmpliaPapeles
            lista={lista}
            modo={modo}
            arbol={arbol}
            desde={destino.id}
            mostrarDonde={incluirSub || !!q.trim()}
            uso={uso}
            sel={sel}
            setSel={setSel}
            abrir={abrir}
            arch={arch}
            vacio={q.trim() ? `No hay papeles con «${q.trim()}».` : mirada.docsTotales > 0 ? `Sin papeles sueltos aquí: los ${mirada.docsTotales} están en sus subcarpetas.` : "Esta carpeta está vacía."}
          />
        </div>

        <CarpetaAmpliaDetalles e={e} arbol={arbol} mirada={mirada} todos={todos} documentos={documents} uso={uso} ahora={ahora} abrir={abrir} onLigar={() => setVinculando(e.carpeta)} />
      </div>
    </section>
  );
}
