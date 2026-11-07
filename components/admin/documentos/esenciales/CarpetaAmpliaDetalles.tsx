"use client";

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { Eye, Lock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { masAbiertos, type CarpetaEsencial, type UsoDoc } from "@/lib/documentos/esenciales";
import { aplanar, type NodoArbol } from "@/lib/documentos/arbol-esencial";
import { esTagDeVinculo } from "@/lib/documentos/terceros-vinculo";
import { formatBytes, getFileIcon } from "../archivo-visual";
import { tagsVisibles } from "../archivo/compartido";
import { haceCuanto, papeles, quienLaVe, subcarpetas, veces } from "./compartido";
import LigadaA from "./LigadaA";
import MovimientosCarpeta from "./MovimientosCarpeta";

const CAJA = "grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm";
const CHIP = "inline-flex items-center gap-1 rounded-lg bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]";

function Dato({ k, v, candado }: { k: string; v: string; candado?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--text-tertiary)]">{k}</dt>
      <dd className="flex items-center gap-1 font-bold text-[var(--text-primary)]">
        {candado && <Lock className="h-4 w-4 shrink-0" aria-label="Con candado" />}
        <span className="truncate" title={v}>{v}</span>
      </dd>
    </div>
  );
}

/**
 * La columna de detalles de la carpeta amplia: los números de la carpeta esencial
 * (los mismos del panel), los de la subcarpeta que estás mirando y lo que más se
 * abre adentro.
 */
export default function CarpetaAmpliaDetalles({ e, arbol, mirada, todos, documentos, uso, ahora, abrir, onLigar }: {
  e: CarpetaEsencial<DbDocumentFolder>;
  arbol: NodoArbol<DbDocumentFolder>;
  mirada: NodoArbol<DbDocumentFolder>;
  /** Los papeles de toda la carpeta esencial. */
  todos: readonly DbDocument[];
  /** Todos los papeles del Archivo: «Movimientos» abre el papel de una fila. */
  documentos: readonly DbDocument[];
  uso: Record<string, UsoDoc>;
  ahora: number;
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  /** «Ligar a…»: la ventana de vincular a un tercero (ADR-502). */
  onLigar: () => void;
}) {
  const f = e.carpeta;
  const acceso = quienLaVe(f.allowedRoles);
  const etiquetas = tagsVisibles(f.tags).filter((t) => !esTagDeVinculo(t));
  const destacados = useMemo(() => masAbiertos(todos, uso, 5), [todos, uso]);
  const { nSub, niveles } = useMemo(() => {
    const nodos = aplanar(arbol);
    return { nSub: nodos.length - 1, niveles: nodos.reduce((m, n) => Math.max(m, n.nivel), 0) };
  }, [arbol]);
  const enSub = mirada.carpeta.id !== f.id;
  const accesoSub = quienLaVe(mirada.carpeta.allowedRoles);

  return (
    <aside className="min-w-0 space-y-4" aria-label="Detalles de la carpeta" data-qa="amplia-detalles">
      <section className="space-y-2" aria-label="Detalles">
        <CardTitle>Detalles</CardTitle>
        <dl className={CAJA}>
          <Dato k="Papeles" v={papeles(e.docs)} />
          <Dato k="Subcarpetas" v={nSub > 0 ? `${subcarpetas(nSub)} · ${niveles} ${niveles === 1 ? "nivel" : "niveles"}` : "Ninguna"} />
          <Dato k="Tamaño" v={e.bytes > 0 ? formatBytes(e.bytes) : "—"} />
          <Dato k="Aperturas (90 días)" v={e.vistas > 0 ? veces(e.vistas) : "Ninguna"} />
          <Dato k="Último movimiento" v={haceCuanto(e.ultima, ahora) ?? "—"} />
          <Dato k="Creada" v={formatDate(f.createdAt)} />
          <div className="col-span-2">
            <Dato k="Quién la ve" v={acceso.texto} candado={acceso.cerrada} />
          </div>
          <div className="col-span-2">
            <Dato k="Dónde vive" v={e.ruta.length > 0 ? e.ruta.join(" › ") : "En la raíz del Archivo"} />
          </div>
          {(e.vencidos > 0 || e.porVencer > 0) && (
            <div className="col-span-2 text-xs font-bold" data-qa="amplia-vencen">
              {e.vencidos > 0 && <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{e.vencidos} vencido{e.vencidos === 1 ? "" : "s"}</span>}
              {e.vencidos > 0 && e.porVencer > 0 && <span className="text-[var(--text-tertiary)]"> · </span>}
              {e.porVencer > 0 && <span className="text-[var(--data-warning-ink)]">{e.porVencer} vence{e.porVencer === 1 ? "" : "n"} en 30 días</span>}
            </div>
          )}
          {etiquetas.length > 0 && (
            <div className="col-span-2 flex flex-wrap gap-1">
              {etiquetas.map((t) => <span key={t} className={CHIP}>#{t}</span>)}
            </div>
          )}
        </dl>
        {/* A quién está ligada (antes una pastilla «N terceros»), como en el panel. */}
        <LigadaA carpeta={f} onLigar={onLigar} />
      </section>

      {enSub && (
        <section className="space-y-2" aria-label={`Detalles de ${mirada.carpeta.name}`} data-qa="amplia-detalles-sub">
          <CardTitle className="truncate">En «{mirada.carpeta.name}»</CardTitle>
          <dl className={CAJA}>
            <Dato k="Papeles" v={papeles(mirada.docsTotales)} />
            <Dato k="Sueltos aquí" v={papeles(mirada.docsDirectos)} />
            <Dato k="Subcarpetas" v={mirada.hijos.length > 0 ? subcarpetas(mirada.hijos.length) : "Ninguna"} />
            <Dato k="Tamaño" v={mirada.bytesTotales > 0 ? formatBytes(mirada.bytesTotales) : "—"} />
            <div className="col-span-2">
              <Dato k="Quién la ve" v={accesoSub.texto} candado={accesoSub.cerrada} />
            </div>
          </dl>
        </section>
      )}

      {destacados.length > 0 && (
        <section className="space-y-2" aria-label="Lo que más abres aquí">
          <CardTitle>Lo que más abres aquí</CardTitle>
          <ul className="grid gap-2">
            {destacados.map((doc) => {
              const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
              return (
                <li key={doc.id}>
                  <button type="button" onClick={() => abrir(doc, destacados)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-left hover:border-[var(--accent)]">
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
      <MovimientosCarpeta carpetaId={f.id} marca={`${todos.length}:${e.ultima ?? ""}`} documentos={documentos} abrir={abrir} ahora={ahora} />
    </aside>
  );
}
