"use client";

import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import type { NodoArbol } from "@/lib/documentos/arbol-esencial";
import { FolderGlyph } from "../folder-visuals";
import { formatBytes } from "../archivo-visual";
import { papeles } from "./compartido";

export type Nodo = NodoArbol<DbDocumentFolder>;

/** Lo que cada nodo necesita del árbol (un solo objeto: el nodo se llama a sí mismo para sus hijas). */
export interface CtxArbol {
  abiertos: ReadonlySet<string>;
  elegida: string;
  /** El nodo que recibe el Tab (tabindex 0); el resto, -1. */
  foco: string;
  /** El nodo sobre el que se arrastra algo ahora. */
  encima: string | null;
  compacto: boolean;
  registrar: (id: string, el: HTMLLIElement | null) => void;
  alternar: (id: string) => void;
  elegir: (nodo: Nodo) => void;
  setFoco: (id: string) => void;
  sobre: (e: React.DragEvent, nodo: Nodo) => void;
  sale: (e: React.DragEvent, id: string) => void;
  suelta: (e: React.DragEvent, id: string) => void;
}

/** Una carpeta del árbol con sus hijas (si está desplegada). */
export default function ArbolEsencialNodo({ nodo, ctx }: { nodo: Nodo; ctx: CtxArbol }) {
  const { carpeta: c, hijos, nivel } = nodo;
  const tieneHijos = hijos.length > 0;
  const abierto = tieneHijos && ctx.abiertos.has(c.id);
  const esElegida = ctx.elegida === c.id;
  const encima = ctx.encima === c.id;
  const sueltos = nodo.docsDirectos;

  return (
    <li
      role="treeitem"
      ref={(el) => { ctx.registrar(c.id, el); }}
      tabIndex={ctx.foco === c.id ? 0 : -1}
      aria-level={nivel + 1}
      aria-selected={esElegida}
      aria-expanded={tieneHijos ? abierto : undefined}
      aria-label={`${c.name}, ${papeles(nodo.docsTotales)}`}
      onFocus={(e) => { if (e.target === e.currentTarget) ctx.setFoco(c.id); }}
      className="outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-[var(--accent)]"
      data-qa="arbol-nodo"
      data-id={c.id}
    >
      {/* El teclado lo maneja el árbol (↑↓←→, Enter): la fila sólo atiende el mouse y el arrastre. */}
      <div
        onClick={() => ctx.elegir(nodo)}
        onDragOver={(e) => ctx.sobre(e, nodo)}
        onDragLeave={(e) => ctx.sale(e, c.id)}
        onDrop={(e) => ctx.suelta(e, c.id)}
        title={tieneHijos ? `${papeles(sueltos)} sueltos aquí · ${papeles(nodo.docsTotales)} con sus subcarpetas` : undefined}
        className={cn(
          "relative flex cursor-pointer select-none items-center gap-1.5 rounded-lg pr-2 transition-colors",
          ctx.compacto ? "h-10" : "h-11",
          esElegida
            ? "bg-[var(--accent-muted)] text-[var(--accent-ink)]"
            : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
          encima && "bg-[var(--accent-soft)] outline-dashed outline-2 -outline-offset-2 outline-[var(--accent)]",
        )}
        style={{ paddingInlineStart: `${0.25 + Math.min(nivel, 8) * (ctx.compacto ? 0.75 : 1)}rem` }}
      >
        {esElegida && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-[var(--accent)]" />}
        <span
          aria-hidden
          onClick={(e) => {
            if (!tieneHijos) return;
            e.stopPropagation();
            ctx.alternar(c.id);
          }}
          className={cn("flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)]", tieneHijos && "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]")}
          data-qa="arbol-chevron"
        >
          {tieneHijos && <ChevronRight className={cn("h-4 w-4 transition-[rotate] duration-[var(--dur-fast)] motion-reduce:transition-none", abierto && "rotate-90")} />}
        </span>
        <FolderGlyph folder={c} active={esElegida || abierto} className="h-5 w-5 shrink-0 text-lg" />
        <span className={cn("min-w-0 flex-1 truncate text-sm", esElegida ? "font-bold" : "font-semibold")}>{c.name}</span>
        <span className={cn("shrink-0 text-xs tabular-nums", esElegida ? "font-bold" : "text-[var(--text-tertiary)]")} data-qa="arbol-cuenta">
          {nodo.docsTotales}
        </span>
        {!ctx.compacto && (
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--text-tertiary)]">
            {nodo.bytesTotales > 0 ? formatBytes(nodo.bytesTotales) : ""}
          </span>
        )}
      </div>
      {abierto && (
        <ul role="group" className="space-y-0.5 pt-0.5">
          {hijos.map((h) => <ArbolEsencialNodo key={h.carpeta.id} nodo={h} ctx={ctx} />)}
        </ul>
      )}
    </li>
  );
}
