"use client";

import { useRef } from "react";
import { ChevronRight, Download, FolderInput, LayoutGrid, List, Loader2, Search, Upload, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { NodoArbol } from "@/lib/documentos/arbol-esencial";
import type { OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import { CAMPO_BUSCAR, SELECT, papeles } from "./compartido";

export type ModoPapeles = "lista" | "miniaturas";

const ORDENES: { id: OrdenDocsTercero; label: string }[] = [
  { id: "fecha", label: "Recientes" },
  { id: "nombre", label: "Por nombre" },
  { id: "vencimiento", label: "Vence antes" },
];

const MODOS: { id: ModoPapeles; label: string; Icon: typeof List }[] = [
  { id: "lista", label: "Ver en lista", Icon: List },
  { id: "miniaturas", label: "Ver con miniaturas", Icon: LayoutGrid },
];

/**
 * Arriba de los papeles: dónde estás (migas desde la carpeta esencial), buscar
 * adentro, orden, lista o miniaturas, «Subir aquí» e «Incluir subcarpetas». Con
 * papeles elegidos, la fila para moverlos o bajarlos juntos (en el celular no
 * se arrastra: «Mover a…» es el camino).
 */
export default function CarpetaAmpliaBarra(p: {
  camino: readonly NodoArbol<DbDocumentFolder>[];
  irA: (id: string) => void;
  raiz: DbDocumentFolder;
  q: string;
  setQ: (q: string) => void;
  orden: OrdenDocsTercero;
  setOrden: (o: OrdenDocsTercero) => void;
  modo: ModoPapeles;
  setModo: (m: ModoPapeles) => void;
  incluirSub: boolean;
  setIncluirSub: (v: boolean) => void;
  tieneSubcarpetas: boolean;
  total: number;
  subiendo: boolean;
  onSubir: (archivos: File[]) => void;
  elegidos: readonly DbDocument[];
  opcionesMover: readonly NodoArbol<DbDocumentFolder>[];
  onMover: (folderId: string) => void;
  onZip: () => void;
  onLimpiar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buscando = !!p.q.trim();
  const aqui = p.camino.at(-1)?.carpeta ?? p.raiz;

  return (
    <div className="space-y-3">
      <nav aria-label="Dónde estás" className="flex flex-wrap items-center gap-1 text-sm" data-qa="amplia-migas">
        {p.camino.map((n, i) => (
          <span key={n.carpeta.id} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />}
            {i < p.camino.length - 1 ? (
              <button type="button" onClick={() => p.irA(n.carpeta.id)} className="max-w-[12rem] truncate rounded-md px-1 py-1 font-bold text-[var(--accent-ink)] hover:underline">
                {n.carpeta.name}
              </button>
            ) : (
              <span className="max-w-[16rem] truncate px-1 font-bold text-[var(--text-primary)]" aria-current="page">{n.carpeta.name}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-[1_1_14rem]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={p.q}
            onChange={(e) => p.setQ(e.target.value)}
            aria-label={`Buscar en ${p.raiz.name}`}
            placeholder={`Buscar en «${p.raiz.name}»…`}
            className={CAMPO_BUSCAR}
          />
        </div>
        <select value={p.orden} onChange={(e) => p.setOrden(e.target.value as OrdenDocsTercero)} aria-label="Ordenar papeles" className={cn(SELECT, "w-[8.5rem] shrink-0")}>
          {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-[var(--rule-base)]" role="group" aria-label="Cómo se ven los papeles">
          {MODOS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => p.setModo(id)}
              aria-pressed={p.modo === id}
              aria-label={label}
              title={label}
              className={cn(
                "flex h-12 w-12 items-center justify-center transition-colors",
                p.modo === id ? "bg-[var(--accent-muted)] text-[var(--accent-ink)]" : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={p.subiendo} className={cn(button({ variant: "secondary" }), "shrink-0 gap-2")} title={`Sube a «${aqui.name}»`}>
          {p.subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir aquí
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            p.onSubir(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={cn("inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-primary)]", (buscando || !p.tieneSubcarpetas) && "cursor-default opacity-60")}>
          <input
            type="checkbox"
            checked={p.incluirSub || buscando}
            disabled={buscando || !p.tieneSubcarpetas}
            onChange={(e) => p.setIncluirSub(e.target.checked)}
            className="h-5 w-5 rounded border border-[var(--rule-base)] accent-[var(--accent)]"
            data-qa="amplia-incluir-sub"
          />
          Incluir subcarpetas
        </label>
        <span className="text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite" data-qa="amplia-total">
          {buscando ? `${papeles(p.total)} en toda la carpeta` : papeles(p.total)}
        </span>
      </div>

      {p.elegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-2" data-qa="amplia-seleccion">
          <span className="px-2 text-sm font-bold text-[var(--text-primary)]">
            {p.elegidos.length === 1 ? "1 elegido" : `${p.elegidos.length} elegidos`}
          </span>
          <div className="relative min-w-0 flex-[1_1_12rem]">
            <FolderInput className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <select
              value=""
              onChange={(e) => { if (e.target.value) p.onMover(e.target.value); }}
              aria-label="Mover los elegidos a otra carpeta"
              className={cn(SELECT, "w-full pl-9")}
              data-qa="amplia-mover-a"
            >
              <option value="">Mover a…</option>
              {p.opcionesMover.map((n) => (
                <option key={n.carpeta.id} value={n.carpeta.id}>
                  {"  ".repeat(n.nivel)}{n.carpeta.name} ({n.docsTotales})
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={p.onZip} className={cn(button({ variant: "secondary" }), "gap-2")}>
            <Download className="h-4 w-4" /> ZIP
          </button>
          <button type="button" onClick={p.onLimpiar} aria-label="Quitar la selección" title="Quitar la selección" className={button({ variant: "ghost", size: "icon" })}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
