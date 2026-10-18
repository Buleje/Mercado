"use client";

/**
 * VistaExplorador — íconos grandes, medianos y lista del Archivo, como el
 * Explorador de Windows: carpetas primero, grupos con su título («Agrupar
 * por»), un rectángulo arrastrado sobre el fondo elige varios, lo arrastrado
 * se suelta en una carpeta para moverlo y el teclado es el de Windows (lo arma
 * `use-teclado-explorador`; un solo Tab entra a la grilla).
 *
 * Esta pieza sólo dibuja: qué está elegido, qué se corta y qué hace cada
 * gesto lo decide `use-explorador`.
 */

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import ElementoExplorador from "./ElementoExplorador";
import { claveCarpeta, claveDoc } from "./contenido-explorador";
import type { CargaArrastre } from "./destino-soltar";
import type { Grupo } from "./orden-agrupar";
import type { PuntoDeMenu } from "./ubicar-menu";
import { useRectanguloSeleccion } from "./use-rectangulo-seleccion";
import type { SeleccionExplorador } from "./use-seleccion-explorador";
import type { VistaIconos } from "./vista-archivo";

export type ObjetivoMenu =
  | { tipo: "carpeta"; carpeta: DbDocumentFolder }
  | { tipo: "doc"; doc: DbDocument }
  | { tipo: "fondo" };

export interface PropsVistaExplorador {
  vista: VistaIconos;
  grupos: readonly Grupo[];
  sel: SeleccionExplorador;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  estaCortado: (clave: string) => boolean;
  abrir: (clave: string) => void;
  /** `clave === null` = el espacio vacío; `tactil` = vino de mantener presionado. */
  menu: (clave: string | null, punto: PuntoDeMenu, tactil?: boolean) => void;
  cargaAlArrastrar: (clave: string) => CargaArrastre;
  puedeSoltar: (carpetaId: string) => boolean;
  soltar: (carga: CargaArrastre, carpetaId: string) => void;
  /** La frase cuando no hay nada. */
  vacio: string;
  /** «5 carpetas · 12 archivos», en la barra de estado de abajo. */
  resumen: string;
}

const POR_TANDA = 60;

const GRILLA: Record<VistaIconos, string> = {
  grandes: "grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] sm:gap-2",
  medianos: "grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]",
  lista: "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-2 gap-y-0.5",
};

type Pieza = { clave: string; objeto: { tipo: "carpeta"; carpeta: DbDocumentFolder } | { tipo: "doc"; doc: DbDocument } };

const piezasDe = (g: Grupo): Pieza[] => [
  ...g.carpetas.map((carpeta) => ({ clave: claveCarpeta(carpeta.id), objeto: { tipo: "carpeta" as const, carpeta } })),
  ...g.docs.map((doc) => ({ clave: claveDoc(doc.id), objeto: { tipo: "doc" as const, doc } })),
];

export default function VistaExplorador(p: PropsVistaExplorador) {
  const [visibles, setVisibles] = useState(POR_TANDA);
  const caja = useRef<HTMLDivElement>(null);
  // En el celular, mantener presionado con varios elegidos abre el menú de
  // todos sin cambiar la selección (allí se elige con toques, no con Ctrl).
  const puntero = useRef("mouse");
  const { sel } = p;
  const rect = useRectanguloSeleccion({ contenedor: caja, alElegir: sel.fijar, alLimpiar: sel.limpiar, base: () => sel.base });

  // Los grupos, cortados a lo que se ve (la tanda corre a lo largo de todos).
  let quedan = visibles;
  let total = 0;
  const tramos = p.grupos.map((g) => {
    const piezas = piezasDe(g);
    total += piezas.length;
    const aLaVista = piezas.slice(0, Math.max(0, quedan));
    quedan -= aLaVista.length;
    return { g, piezas: aLaVista, cuantos: piezas.length };
  });
  const dibujadas = tramos.flatMap((t) => t.piezas.map((x) => x.clave));
  const enfocable = sel.marcado && dibujadas.includes(sel.marcado) ? sel.marcado : dibujadas[0];

  return (
    <div className="space-y-3">
      <div
        ref={caja}
        role="listbox"
        aria-label="Carpetas y archivos"
        aria-multiselectable
        tabIndex={-1}
        data-qa="explorador"
        onKeyDown={p.onKeyDown}
        {...rect.handlers}
        onPointerDownCapture={(e) => { puntero.current = e.pointerType; }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-clave]")) return;
          e.preventDefault();
          sel.limpiar();
          p.menu(null, { x: e.clientX, y: e.clientY }, puntero.current === "touch");
        }}
        className={cn(
          "relative grid min-h-48 content-start rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 outline-none select-none sm:p-3",
          GRILLA[p.vista],
        )}
      >
        {total === 0 && <p className="col-span-full py-10 text-center text-sm text-[var(--text-tertiary)]">{p.vacio}</p>}
        {tramos.map(({ g, piezas, cuantos }) =>
          piezas.length === 0 ? null : (
            <div key={g.clave} role="group" aria-label={g.titulo || undefined} className="contents">
              {g.titulo && (
                <div className="col-span-full flex items-center gap-2 px-1 pb-0.5 pt-2 text-xs font-bold text-[var(--text-secondary)] first:pt-0">
                  <span>
                    {g.titulo} <span className="font-semibold tabular-nums text-[var(--text-tertiary)]">({cuantos})</span>
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
                </div>
              )}
              {piezas.map(({ clave, objeto }) => (
                <ElementoExplorador
                  key={clave}
                  vista={p.vista}
                  objeto={objeto}
                  clave={clave}
                  enfocable={clave === enfocable}
                  elegido={sel.esta(clave)}
                  cortado={p.estaCortado(clave)}
                  onClic={(m) => sel.clic(clave, m)}
                  onAbrir={() => p.abrir(clave)}
                  onMenu={(punto) => p.menu(clave, punto, puntero.current === "touch")}
                  onFoco={() => { if (!sel.hayAlgo) sel.clic(clave); }}
                  cargaAlArrastrar={() => p.cargaAlArrastrar(clave)}
                  puedeSoltar={objeto.tipo === "carpeta" ? () => p.puedeSoltar(objeto.carpeta.id) : undefined}
                  onSoltar={objeto.tipo === "carpeta" ? (carga) => p.soltar(carga, objeto.carpeta.id) : undefined}
                />
              ))}
            </div>
          ),
        )}
        {rect.caja && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-sm border border-[var(--accent)] bg-[var(--accent)]/10"
            style={{ left: rect.caja.left, top: rect.caja.top, width: rect.caja.width, height: rect.caja.height }}
          />
        )}
      </div>
      {/* Barra de estado, como la de Windows: cuánto hay y cuánto elegiste. */}
      <div className="flex items-center gap-3 px-1 text-xs tabular-nums text-[var(--text-tertiary)]" aria-live="polite">
        <span>{p.resumen}</span>
        {p.sel.efectiva.length > 1 && <span className="font-semibold text-[var(--text-secondary)]">{p.sel.efectiva.length} elegidos</span>}
      </div>
      {total > visibles && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibles((n) => n + POR_TANDA)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
          >
            Ver más <span className="tabular-nums text-[var(--text-tertiary)]">({total - visibles} restantes)</span>
          </button>
        </div>
      )}
    </div>
  );
}
