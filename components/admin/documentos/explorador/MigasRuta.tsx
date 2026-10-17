"use client";

/**
 * Barra de dirección del explorador del Archivo: Atrás, Subir un nivel y la
 * ruta (Archivo › Facturas › 2026), como la de Windows. Cada tramo de la ruta
 * lleva a esa carpeta y acepta archivos arrastrados (se mueven ahí).
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowUp, ChevronRight, FileArchive, FolderArchive } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

interface Props {
  /** De la raíz a la carpeta abierta. Vacío = estás en la raíz. */
  ruta: readonly DbDocumentFolder[];
  /** «Archivo» en la raíz; «Favoritos», «Recientes»… en las otras vistas. */
  raiz: string;
  onIr: (carpetaId: string | null) => void;
  puedeAtras: boolean;
  onAtras: () => void;
  /** «5 carpetas · 12 archivos». */
  resumen: string;
  onSoltarDoc: (docId: string, carpetaId: string | null) => void;
  zip?: { onClick: () => void; ocupado: boolean };
}

const BOTON =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function MigasRuta({ ruta, raiz, onIr, puedeAtras, onAtras, resumen, onSoltarDoc, zip }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);
  const padre = ruta.length > 1 ? ruta[ruta.length - 2].id : null;

  const soltable = (id: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setSobre(id ?? "raiz");
    },
    onDragLeave: () => setSobre(null),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
      e.preventDefault();
      e.stopPropagation();
      setSobre(null);
      onSoltarDoc(e.dataTransfer.getData("application/x-doc-id"), id);
    },
  });

  const tramo = (id: string | null, etiqueta: React.ReactNode, ultimo: boolean) => (
    <button
      type="button"
      onClick={() => onIr(id)}
      disabled={ultimo}
      aria-current={ultimo ? "location" : undefined}
      {...soltable(id)}
      className={cn(
        "inline-flex min-h-12 max-w-[14rem] items-center gap-1.5 truncate rounded-xl px-2 text-sm font-bold transition-colors",
        ultimo ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
        sobre === (id ?? "raiz") && "bg-primary/10 ring-2 ring-primary",
      )}
    >
      {etiqueta}
    </button>
  );

  return (
    <nav
      aria-label="Ruta de carpetas"
      className="flex min-w-0 items-center gap-1 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1"
    >
      <button type="button" className={BOTON} onClick={onAtras} disabled={!puedeAtras} aria-label="Atrás" title="Atrás (Alt+←)">
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        className={BOTON}
        onClick={() => onIr(padre)}
        disabled={ruta.length === 0}
        aria-label="Subir un nivel"
        title="Subir un nivel (Alt+↑)"
      >
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>
      <div className="mx-1 h-6 w-px shrink-0 bg-[var(--rule-base)]" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tramo(null, <><FolderArchive className="h-4 w-4 shrink-0" aria-hidden /> {raiz}</>, ruta.length === 0)}
        {ruta.map((f, i) => (
          <span key={f.id} className="inline-flex min-w-0 items-center gap-0.5">
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {tramo(f.id, <span className="truncate">{f.name}</span>, i === ruta.length - 1)}
          </span>
        ))}
      </div>
      <span className="hidden shrink-0 px-2 text-xs tabular-nums text-[var(--text-tertiary)] sm:inline">{resumen}</span>
      {zip && (
        <button
          type="button"
          className={BOTON}
          onClick={zip.onClick}
          disabled={zip.ocupado}
          aria-label="Descargar los archivos de esta carpeta (ZIP)"
          title={zip.ocupado ? "Comprimiendo…" : "Descargar los archivos de esta carpeta (ZIP)"}
        >
          <FileArchive className="h-5 w-5" aria-hidden />
        </button>
      )}
      <InfoTip
        title="Cómo se usa"
        what="Doble clic en una carpeta para entrar; en un archivo, para abrirlo. En el celular basta un toque."
        affects="Clic derecho (o mantener presionado, o Shift+F10) muestra las opciones: fijar, cambiar nombre, poner una imagen como ícono…"
        example="Arrastra un archivo sobre una carpeta o sobre un tramo de esta ruta para moverlo ahí."
        className="mr-2 shrink-0"
      />
    </nav>
  );
}

/**
 * «Atrás» del explorador: dónde estuviste antes, en este orden. Va aparte del
 * historial del navegador porque el Drive cambia la carpeta sin crear entradas
 * (`replaceState`): el botón Atrás del navegador te sacaría de la pantalla.
 */
export function useHistorialCarpetas(actual: string | null) {
  const pila = useRef<(string | null)[]>([]);
  const previo = useRef(actual);
  const volviendo = useRef(false);
  const [largo, setLargo] = useState(0);

  useEffect(() => {
    if (previo.current === actual) return;
    if (!volviendo.current) pila.current.push(previo.current);
    volviendo.current = false;
    previo.current = actual;
    setLargo(pila.current.length);
  }, [actual]);

  /** Devuelve a dónde volver (`undefined` = no hay a dónde). */
  const atras = useCallback((): string | null | undefined => {
    if (pila.current.length === 0) return undefined;
    volviendo.current = true;
    const destino = pila.current.pop();
    setLargo(pila.current.length);
    return destino;
  }, []);

  return { puedeAtras: largo > 0, atras };
}
