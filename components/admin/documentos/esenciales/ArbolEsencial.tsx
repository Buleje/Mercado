"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { ancestrosDe, aplanar, armarArbol, leerIdsArrastrados, visiblesEnOrden } from "@/lib/documentos/arbol-esencial";
import ArbolEsencialNodo, { type CtxArbol } from "./ArbolEsencialNodo";

/** Lo que lleva un papel (o varios elegidos) al arrastrarlo: JSON con la lista de ids. */
export const TIPO_ARRASTRE_PAPEL = "application/x-buleje-papel";

/** Lo que tarda en desplegarse una carpeta cerrada cuando arrastras algo encima (para llegar al 4.º nivel). */
const ABRIR_AL_ARRASTRAR_MS = 700;

/**
 * La carpeta esencial entera, desplegable (Brandon 23-10: «hoy el panel muestra un
 * nivel por vez»): cada rama con su cuenta de papeles, abierta hasta la elegida, con
 * teclado de árbol (↑↓ entre carpetas, → despliega o entra, ← pliega o sube, Inicio/Fin,
 * Enter elige, * despliega las hermanas) y soltar encima: papeles (se mueven) o
 * archivos del disco (se suben).
 */
export default function ArbolEsencial({ raiz, carpetas, docs, elegida, onElegir, onMoverDocs, onSoltarArchivos, compacto = false }: {
  raiz: DbDocumentFolder;
  carpetas: readonly DbDocumentFolder[];
  docs: readonly DbDocument[];
  elegida: string;
  onElegir: (folderId: string) => void;
  /** Soltar papeles (arrastrados con TIPO_ARRASTRE_PAPEL) sobre una carpeta del árbol. */
  onMoverDocs?: (ids: string[], folderId: string) => void;
  /** Soltar archivos del disco sobre una carpeta del árbol. */
  onSoltarArchivos?: (folderId: string, e: React.DragEvent) => void;
  compacto?: boolean;
}) {
  const arbol = useMemo(() => armarArbol(raiz, carpetas, docs), [raiz, carpetas, docs]);
  // Abierto hasta la elegida y la elegida misma (igual que al hacerle clic): se ven sus subcarpetas.
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set([raiz.id, ...ancestrosDe(arbol, elegida), elegida]));
  const [foco, setFoco] = useState(elegida);
  const [encima, setEncima] = useState<string | null>(null);
  const filas = useRef(new Map<string, HTMLLIElement>());
  const espera = useRef<{ id: string; t: ReturnType<typeof setTimeout> } | null>(null);

  // La elegida cambió desde afuera (migas, otra subcarpeta): se despliega hasta ella.
  const [vista, setVista] = useState(elegida);
  if (vista !== elegida) {
    setVista(elegida);
    setFoco(elegida);
    const faltan = [...ancestrosDe(arbol, elegida), elegida].filter((id) => !abiertos.has(id));
    if (faltan.length > 0) setAbiertos(new Set([...abiertos, ...faltan]));
  }

  useEffect(() => () => { if (espera.current) clearTimeout(espera.current.t); }, []);

  const visibles = useMemo(() => visiblesEnOrden(arbol, abiertos), [arbol, abiertos]);
  const conHijas = useMemo(() => aplanar(arbol).filter((n) => n.hijos.length > 0).map((n) => n.carpeta.id), [arbol]);
  const todoAbierto = conHijas.every((id) => abiertos.has(id));
  // Si la del foco quedó adentro de una rama plegada, el Tab vuelve a la elegida (o a la raíz).
  const enFoco = visibles.some((v) => v.nodo.carpeta.id === foco)
    ? foco
    : visibles.some((v) => v.nodo.carpeta.id === elegida) ? elegida : raiz.id;

  const enfocar = (id: string) => {
    setFoco(id);
    filas.current.get(id)?.focus();
  };
  const alternar = (id: string, abrir?: boolean) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (abrir ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });
  const cancelarEspera = () => {
    if (espera.current) clearTimeout(espera.current.t);
    espera.current = null;
  };
  const tipoDe = (e: React.DragEvent): "papel" | "archivo" | null => {
    const tipos = [...e.dataTransfer.types];
    if (onMoverDocs && tipos.includes(TIPO_ARRASTRE_PAPEL)) return "papel";
    if (onSoltarArchivos && tipos.includes("Files")) return "archivo";
    return null;
  };

  const ctx: CtxArbol = {
    abiertos,
    elegida,
    foco: enFoco,
    encima,
    compacto,
    registrar: (id, el) => { if (el) filas.current.set(id, el); else filas.current.delete(id); },
    alternar: (id) => alternar(id),
    elegir: (nodo) => {
      const id = nodo.carpeta.id;
      setFoco(id);
      if (nodo.hijos.length > 0 && !abiertos.has(id)) alternar(id, true);
      onElegir(id);
    },
    setFoco,
    sobre: (e, nodo) => {
      const tipo = tipoDe(e);
      if (!tipo) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = tipo === "papel" ? "move" : "copy";
      const id = nodo.carpeta.id;
      if (encima !== id) setEncima(id);
      if (nodo.hijos.length > 0 && !abiertos.has(id) && espera.current?.id !== id) {
        cancelarEspera();
        espera.current = { id, t: setTimeout(() => { espera.current = null; alternar(id, true); }, ABRIR_AL_ARRASTRAR_MS) };
      }
    },
    sale: (e, id) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setEncima((x) => (x === id ? null : x));
      if (espera.current?.id === id) cancelarEspera();
    },
    suelta: (e, id) => {
      const tipo = tipoDe(e);
      if (!tipo) return;
      e.preventDefault();
      e.stopPropagation();
      setEncima(null);
      cancelarEspera();
      if (tipo === "archivo") { onSoltarArchivos?.(id, e); return; }
      const ids = leerIdsArrastrados(e.dataTransfer.getData(TIPO_ARRASTRE_PAPEL));
      if (ids.length > 0) onMoverDocs?.(ids, id);
    },
  };

  const teclado = (e: React.KeyboardEvent) => {
    const i = visibles.findIndex((v) => v.nodo.carpeta.id === enFoco);
    if (i < 0) return;
    const { nodo, padreId } = visibles[i];
    const id = nodo.carpeta.id;
    const tieneHijas = nodo.hijos.length > 0;
    const abierto = abiertos.has(id);
    switch (e.key) {
      case "ArrowDown": if (i < visibles.length - 1) enfocar(visibles[i + 1].nodo.carpeta.id); break;
      case "ArrowUp": if (i > 0) enfocar(visibles[i - 1].nodo.carpeta.id); break;
      case "ArrowRight":
        if (tieneHijas && !abierto) alternar(id, true);
        else if (tieneHijas) enfocar(nodo.hijos[0].carpeta.id);
        break;
      case "ArrowLeft":
        if (tieneHijas && abierto) alternar(id, false);
        else if (padreId) enfocar(padreId);
        break;
      case "Home": enfocar(visibles[0].nodo.carpeta.id); break;
      case "End": enfocar(visibles[visibles.length - 1].nodo.carpeta.id); break;
      case "Enter":
      case " ": ctx.elegir(nodo); break;
      case "*": {
        const hermanas = padreId ? (visibles.find((v) => v.nodo.carpeta.id === padreId)?.nodo.hijos ?? []) : [nodo];
        setAbiertos(new Set([...abiertos, ...hermanas.filter((h) => h.hijos.length > 0).map((h) => h.carpeta.id)]));
        break;
      }
      default: return;
    }
    e.preventDefault();
  };

  const plegarODesplegar = () =>
    setAbiertos(todoAbierto ? new Set([raiz.id, ...ancestrosDe(arbol, elegida), elegida]) : new Set(conHijas));

  return (
    <div className="flex min-h-0 flex-col gap-1" data-qa="arbol-esencial">
      {conHijas.length > 1 && (
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-xs font-bold text-[var(--text-tertiary)]">Carpetas</span>
          <button
            type="button"
            onClick={plegarODesplegar}
            aria-pressed={todoAbierto}
            className={cn(button({ variant: "ghost" }), "gap-1.5 px-3 text-sm")}
            data-qa="arbol-desplegar"
          >
            <ChevronsUpDown className="h-4 w-4" /> {todoAbierto ? "Plegar" : "Desplegar todo"}
          </button>
        </div>
      )}
      <ul role="tree" aria-label={`Carpetas de ${raiz.name}`} onKeyDown={teclado} className="space-y-0.5">
        <ArbolEsencialNodo nodo={arbol} ctx={ctx} />
      </ul>
    </div>
  );
}
