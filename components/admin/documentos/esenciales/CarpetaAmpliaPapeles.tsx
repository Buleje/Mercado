"use client";

import { useMemo, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Eye } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { UsoDoc } from "@/lib/documentos/esenciales";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";
import { rutaRelativa, type NodoArbol } from "@/lib/documentos/arbol-esencial";
import DocThumb from "../DocThumb";
import { formatBytes, getFileIcon } from "../archivo-visual";
import { ExpiryBadge } from "../archivo/piezas-sueltas";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { TIPO_ARRASTRE_PAPEL } from "./ArbolEsencial";
import type { ModoPapeles } from "./CarpetaAmpliaBarra";

/** Cuántos se dibujan de una vez: una carpeta esencial con subcarpetas puede traer cientos. */
const PAGINA = 120;
const CASILLA = "h-5 w-5 rounded border border-[var(--rule-base)] accent-[var(--accent)]";
const parar = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Los papeles de la carpeta mirada, en lista (tabla del DS) o con miniaturas. Clic
 * abre la vista previa con las flechas por esta lista; clic derecho, el menú del
 * Archivo; casillas para elegir varios; y se arrastran (uno o los elegidos) al árbol.
 * Las columnas que no entran en el ancho del centro pasan a la línea de abajo del nombre.
 */
export default function CarpetaAmpliaPapeles({ lista, modo, arbol, desde, mostrarDonde, uso, sel, setSel, abrir, arch, vacio }: {
  lista: readonly DbDocument[];
  modo: ModoPapeles;
  arbol: NodoArbol<DbDocumentFolder>;
  /** La carpeta mirada: «Dónde» se dice desde ella. */
  desde: string;
  mostrarDonde: boolean;
  uso: Record<string, UsoDoc>;
  sel: ReadonlySet<string>;
  setSel: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  arch: ModeloArchivo;
  vacio: string;
}) {
  const { menuDe, abrirMenuEn } = arch;
  const [cuantos, setCuantos] = useState(PAGINA);
  const fantasma = useRef<HTMLDivElement>(null);
  // Filtros y orden por columna (la carpeta llega entera; «Mostrar más» sólo recorta lo dibujado).
  const columnas = useMemo<readonly ColumnaFiltro<DbDocument>[]>(() => [
    { id: "nombre", label: "Nombre", tipo: "texto", valor: (d) => d.name },
    { id: "donde", label: "Dónde", tipo: "multi", valor: (d) => (d.folderId ? rutaRelativa(arbol, d.folderId, desde) || "aquí" : "aquí"), visible: mostrarDonde, soloConVarios: true },
    { id: "subido", label: "Subido", tipo: "fecha", numero: (d) => diaDeVigencia(d.uploadedAt) },
    { id: "vence", label: "Vence", tipo: "fecha", numero: (d) => diaDeVigencia(d.expiresAt) },
    { id: "tamano", label: "Tamaño", tipo: "rango", numero: (d) => (d.size ? Math.round((d.size / 1048576) * 100) / 100 : 0), unidad: "MB", paso: 0.1 },
    { id: "aperturas", label: "Aperturas", tipo: "rango", numero: (d) => uso[d.id]?.vistas ?? 0, paso: 1 },
  ], [arbol, desde, mostrarDonde, uso]);
  const accesores = useMemo<Record<string, AccesorOrden<DbDocument>>>(() => ({
    nombre: { valor: (d) => d.name, texto: true },
    donde: { valor: (d) => (d.folderId ? rutaRelativa(arbol, d.folderId, desde) : ""), texto: true },
    subido: { valor: (d) => diaDeVigencia(d.uploadedAt) },
    vence: { valor: (d) => diaDeVigencia(d.expiresAt) },
    tamano: { valor: (d) => d.size },
    aperturas: { valor: (d) => uso[d.id]?.vistas ?? 0 },
  }), [arbol, desde, uso]);
  const f = useFiltrosTabla(lista, columnas);
  const ord = useOrdenColumna(accesores);
  const filas = ord.ordenar(f.filtradas);
  const visibles = filas.slice(0, cuantos);
  const quedan = filas.length - visibles.length;
  const todos = filas.length > 0 && filas.every((d) => sel.has(d.id));

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const arrastrar = (e: React.DragEvent, doc: DbDocument) => {
    const ids = sel.has(doc.id) ? filas.filter((d) => sel.has(d.id)).map((d) => d.id) : [doc.id];
    e.dataTransfer.setData(TIPO_ARRASTRE_PAPEL, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
    const g = fantasma.current;
    if (g && ids.length > 1 && typeof e.dataTransfer.setDragImage === "function") {
      g.textContent = `${ids.length} papeles`;
      e.dataTransfer.setDragImage(g, 16, 16);
    }
  };
  if (lista.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-8 text-center text-sm text-[var(--text-tertiary)]" data-qa="amplia-vacia">
        {vacio}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* La etiqueta que acompaña al puntero al arrastrar varios (fuera de la pantalla hasta que se usa). */}
      <div ref={fantasma} aria-hidden className="pointer-events-none fixed -left-[100rem] top-0 rounded-xl bg-[var(--accent-dark)] px-3 py-2 text-sm font-bold text-[var(--text-inverse)]" />

      <BarraFiltrosTabla vistas="esenciales" f={f} plegableSiempre={modo !== "lista"} />

      {modo === "lista" ? (
        <DataTable aria-label="Papeles" data-qa="amplia-tabla">
          <thead>
            <tr>
              <th className="w-12">
                <input type="checkbox" aria-label="Elegir todos" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(filas.map((d) => d.id)))} className={CASILLA} />
              </th>
              <ThColumna label="Nombre" ids={["nombre"]} f={f} orden={ord} ordenId="nombre" />
              {mostrarDonde && <ThColumna label="Dónde" ids={["donde"]} f={f} orden={ord} ordenId="donde" className="hidden @min-[40rem]:table-cell" />}
              <ThColumna label="Subido" ids={["subido"]} f={f} orden={ord} ordenId="subido" className="hidden whitespace-nowrap @min-[50rem]:table-cell" />
              <ThColumna label="Vence" ids={["vence"]} f={f} orden={ord} ordenId="vence" className="whitespace-nowrap" />
              <ThColumna label="Tamaño" ids={["tamano"]} f={f} derecha orden={ord} ordenId="tamano" className="hidden @min-[50rem]:table-cell" />
              <ThColumna label="Aperturas" ids={["aperturas"]} f={f} derecha orden={ord} ordenId="aperturas" className="hidden @min-[34rem]:table-cell" />
              <th className="w-12"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <SinCoincidenciasFila colSpan={8} />}
            {visibles.map((doc) => {
              const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
              const elegido = sel.has(doc.id);
              const d = mostrarDonde && doc.folderId ? rutaRelativa(arbol, doc.folderId, desde) : "";
              const vistas = uso[doc.id]?.vistas ?? 0;
              return (
                <tr
                  key={doc.id}
                  draggable
                  onDragStart={(e) => arrastrar(e, doc)}
                  onClick={() => abrir(doc, filas)}
                  onContextMenu={(e) => abrirMenuEn(e, doc.id)}
                  className={cn("cursor-pointer", elegido && "bg-[var(--accent-soft)]")}
                  data-qa="amplia-papel"
                  data-id={doc.id}
                >
                  <td onClick={parar}>
                    <input type="checkbox" aria-label={`Elegir ${doc.name}`} checked={elegido} onChange={() => alternar(doc.id)} className={CASILLA} />
                  </td>
                  <td className="w-full max-w-0 max-sm:max-w-none">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                        <Icon className={cn("h-5 w-5", tint)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* Sin onClick propio: el clic sube a la fila (teclado: Enter sobre el nombre). */}
                        <button type="button" className="block max-w-full truncate text-left font-bold text-[var(--text-primary)] hover:underline">{doc.name}</button>
                        <span className="block truncate text-xs text-[var(--text-tertiary)] @min-[50rem]:hidden">
                          {formatDate(doc.uploadedAt)} · {formatBytes(doc.size)}{vistas > 0 ? ` · ${vistas} ${vistas === 1 ? "apertura" : "aperturas"}` : ""}
                        </span>
                        {d && <span className="block truncate text-xs text-[var(--text-tertiary)] @min-[40rem]:hidden">en {d}</span>}
                      </span>
                    </div>
                  </td>
                  {mostrarDonde && (
                    <td className="hidden max-w-[14rem] truncate text-[var(--text-secondary)] max-sm:!hidden @min-[40rem]:table-cell" title={d || undefined}>
                      {d || <span className="text-[var(--text-tertiary)]">aquí</span>}
                    </td>
                  )}
                  <td className="hidden whitespace-nowrap tabular-nums max-sm:!hidden @min-[50rem]:table-cell">{formatDate(doc.uploadedAt)}</td>
                  <td className={cn("whitespace-nowrap", !doc.expiresAt && "max-sm:!hidden")}>
                    {doc.expiresAt ? <ExpiryBadge expiresAt={doc.expiresAt} /> : <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="hidden whitespace-nowrap text-right tabular-nums max-sm:!hidden @min-[50rem]:table-cell">{formatBytes(doc.size)}</td>
                  <td className="hidden whitespace-nowrap text-right tabular-nums max-sm:!hidden @min-[34rem]:table-cell">
                    <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><Eye className="h-4 w-4" /> {vistas}</span>
                  </td>
                  <td onClick={parar} className="w-12">{menuDe(doc)}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3" aria-label="Papeles" data-qa="amplia-miniaturas">
          {visibles.map((doc) => {
            const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
            const elegido = sel.has(doc.id);
            return (
              <li
                key={doc.id}
                draggable
                onDragStart={(e) => arrastrar(e, doc)}
                onContextMenu={(e) => abrirMenuEn(e, doc.id)}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-[var(--surface-raised)] transition-colors",
                  elegido ? "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]" : "border-[var(--rule-base)] hover:border-[var(--accent)]",
                )}
                data-qa="amplia-papel"
                data-id={doc.id}
              >
                <button type="button" tabIndex={-1} aria-hidden onClick={() => abrir(doc, filas)} className="block aspect-[4/3] w-full overflow-hidden bg-[var(--surface-sunken)]">
                  <DocThumb doc={doc} Icon={Icon} tint={tint} bg={bg} iconClassName="h-10 w-10" />
                </button>
                <div className="flex items-center gap-1 p-2">
                  <button type="button" onClick={() => abrir(doc, filas)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">{formatDate(doc.uploadedAt)} · {formatBytes(doc.size)}</span>
                  </button>
                  {menuDe(doc)}
                </div>
                <label className="absolute left-1.5 top-1.5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
                  <input type="checkbox" aria-label={`Elegir ${doc.name}`} checked={elegido} onChange={() => alternar(doc.id)} className={CASILLA} />
                </label>
                {doc.expiresAt && <ExpiryBadge expiresAt={doc.expiresAt} className="absolute right-1.5 top-1.5" />}
              </li>
            );
          })}
        </ul>
      )}

      {quedan > 0 && (
        <button type="button" onClick={() => setCuantos((c) => c + PAGINA)} className={cn(button({ variant: "secondary" }), "w-full")}>
          Mostrar {Math.min(PAGINA, quedan)} más (quedan {quedan})
        </button>
      )}
    </div>
  );
}
