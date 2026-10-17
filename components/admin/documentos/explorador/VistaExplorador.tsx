"use client";

/**
 * VistaExplorador — íconos grandes, medianos y lista del Archivo, con las
 * carpetas primero y después los archivos, como el Explorador de Windows.
 *
 * Teclado (foco itinerante: un solo Tab entra a la grilla):
 * flechas = moverse · Enter = abrir · F2 = cambiar nombre ·
 * Shift+F10 o la tecla de menú = opciones · Espacio = sumar el archivo a la
 * selección · Alt+← = atrás · Alt+↑ = subir un nivel.
 */

import { useMemo, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import ElementoExplorador from "./ElementoExplorador";
import { claveCarpeta, claveDoc } from "./contenido-explorador";
import { puntoDeElemento, type PuntoDeMenu } from "./ubicar-menu";
import type { VistaIconos } from "./vista-archivo";

export type ObjetivoMenu =
  | { tipo: "carpeta"; carpeta: DbDocumentFolder }
  | { tipo: "doc"; doc: DbDocument }
  | { tipo: "fondo" };

interface Props {
  vista: VistaIconos;
  carpetas: readonly DbDocumentFolder[];
  docs: readonly DbDocument[];
  seleccion: ReadonlySet<string>;
  onAbrirCarpeta: (f: DbDocumentFolder) => void;
  onAbrirDoc: (d: DbDocument) => void;
  onMenu: (objetivo: ObjetivoMenu, punto: PuntoDeMenu) => void;
  onAlternarSeleccion: (docId: string) => void;
  onRenombrar: (objetivo: Exclude<ObjetivoMenu, { tipo: "fondo" }>) => void;
  onSoltarDoc: (docId: string, carpetaId: string) => void;
  onArrastrarDoc: (docId: string | null) => void;
  onAtras: () => void;
  onSubir: () => void;
}

const POR_TANDA = 60;

const GRILLA: Record<VistaIconos, string> = {
  grandes: "grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2",
  medianos: "grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1.5",
  lista: "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-2 gap-y-0.5",
};

/** El elemento de la fila de arriba/abajo más cercano en horizontal. */
function vecinoVertical(todos: HTMLElement[], actual: HTMLElement, abajo: boolean): HTMLElement | undefined {
  const r = actual.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const candidatos = todos
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r: o }) => (abajo ? o.top >= r.bottom - 2 : o.bottom <= r.top + 2));
  if (candidatos.length === 0) return undefined;
  const filaY = abajo ? Math.min(...candidatos.map((c) => c.r.top)) : Math.max(...candidatos.map((c) => c.r.top));
  const fila = candidatos.filter((c) => Math.abs(c.r.top - filaY) < 4);
  fila.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - cx) - Math.abs(b.r.left + b.r.width / 2 - cx));
  return fila[0]?.el;
}

export default function VistaExplorador(p: Props) {
  const [visibles, setVisibles] = useState(POR_TANDA);
  const [marcado, setMarcado] = useState<string | null>(null);

  const elementos = useMemo(
    () => [
      ...p.carpetas.map((carpeta) => ({ clave: claveCarpeta(carpeta.id), objeto: { tipo: "carpeta" as const, carpeta } })),
      ...p.docs.map((doc) => ({ clave: claveDoc(doc.id), objeto: { tipo: "doc" as const, doc } })),
    ],
    [p.carpetas, p.docs],
  );
  const porClave = useMemo(() => new Map(elementos.map((e) => [e.clave, e.objeto])), [elementos]);
  const aLaVista = elementos.slice(0, visibles);
  const enfocable = marcado && aLaVista.some((e) => e.clave === marcado) ? marcado : aLaVista[0]?.clave;

  const abrir = (o: (typeof elementos)[number]["objeto"]) => (o.tipo === "carpeta" ? p.onAbrirCarpeta(o.carpeta) : p.onAbrirDoc(o.doc));

  const clic = (clave: string, o: (typeof elementos)[number]["objeto"]) => (e: ReactMouseEvent) => {
    setMarcado(clave);
    if ((e.ctrlKey || e.metaKey) && o.tipo === "doc") p.onAlternarSeleccion(o.doc.id);
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (e.key === "ArrowLeft") p.onAtras();
      else p.onSubir();
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-clave]");
    const clave = el?.dataset.clave;
    const o = clave ? porClave.get(clave) : undefined;
    if (!el || !clave || !o) return;
    if (e.key === "Enter") { e.preventDefault(); abrir(o); return; }
    if (e.key === "F2") { e.preventDefault(); p.onRenombrar(o); return; }
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      p.onMenu(o, puntoDeElemento(el));
      return;
    }
    if (e.key === " " && o.tipo === "doc") { e.preventDefault(); p.onAlternarSeleccion(o.doc.id); return; }
    const todos = [...(e.currentTarget.querySelectorAll<HTMLElement>("[data-clave]"))];
    const i = todos.indexOf(el);
    let sig: HTMLElement | undefined;
    if (e.key === "ArrowRight") sig = todos[i + 1];
    else if (e.key === "ArrowLeft") sig = todos[i - 1];
    else if (e.key === "Home") sig = todos[0];
    else if (e.key === "End") sig = todos[todos.length - 1];
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") sig = vecinoVertical(todos, el, e.key === "ArrowDown");
    else return;
    e.preventDefault();
    if (sig) { sig.focus(); setMarcado(sig.dataset.clave ?? null); }
  };

  return (
    <div className="space-y-3">
      <div
        role="listbox"
        aria-label="Carpetas y archivos"
        aria-multiselectable
        data-qa="explorador"
        onKeyDown={alTeclado}
        onClick={(e) => { if (e.target === e.currentTarget) setMarcado(null); }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-clave]")) return;
          e.preventDefault();
          setMarcado(null);
          p.onMenu({ tipo: "fondo" }, { x: e.clientX, y: e.clientY });
        }}
        className={cn(
          "grid min-h-48 content-start rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 sm:p-3",
          GRILLA[p.vista],
        )}
      >
        {elementos.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-[var(--text-tertiary)]">Esta carpeta está vacía.</p>
        )}
        {aLaVista.map(({ clave, objeto }) => (
          <ElementoExplorador
            key={clave}
            vista={p.vista}
            objeto={objeto}
            clave={clave}
            enfocable={clave === enfocable}
            marcado={marcado === clave}
            seleccionado={objeto.tipo === "doc" && p.seleccion.has(objeto.doc.id)}
            onClic={clic(clave, objeto)}
            onAbrir={() => abrir(objeto)}
            onMenu={(punto) => { setMarcado(clave); p.onMenu(objeto, punto); }}
            onFoco={() => setMarcado((m) => (m === clave ? m : clave))}
            onSoltarDoc={objeto.tipo === "carpeta" ? (docId) => p.onSoltarDoc(docId, objeto.carpeta.id) : undefined}
            onArrastrar={objeto.tipo === "doc" ? (si) => p.onArrastrarDoc(si ? objeto.doc.id : null) : undefined}
          />
        ))}
      </div>
      {elementos.length > visibles && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibles((n) => n + POR_TANDA)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
          >
            Ver más <span className="tabular-nums text-[var(--text-tertiary)]">({elementos.length - visibles} restantes)</span>
          </button>
        </div>
      )}
    </div>
  );
}
