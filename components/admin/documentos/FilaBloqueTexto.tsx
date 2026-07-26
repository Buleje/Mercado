"use client";

/**
 * FilaBloqueTexto — un párrafo del editor de documentos.
 *
 * El textarea crece con el texto, y las acciones (mover, insertar, borrar)
 * aparecen al pasar el mouse — el documento se lee limpio y las herramientas
 * están cuando se las busca.
 *
 * Mover está deshabilitado en los párrafos de tabla y contra ellos: una tabla
 * viaja entera al guardar, y permitir cruzarla dejaría la pantalla mintiendo
 * sobre el archivo.
 */

import { useCallback, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Bold, Italic, Plus, Trash2 } from "@buleje/design-system/icons";
import type { BloqueTexto, FormatoTexto } from "@/lib/documentos/texto-docx";

/** Estilo de cada párrafo según su rol en el documento. */
const ESTILO_TIPO: Record<BloqueTexto["tipo"], string> = {
  titulo: "text-2xl font-black leading-tight",
  subtitulo: "text-lg font-bold leading-snug",
  lista: "text-base leading-relaxed",
  parrafo: "text-base leading-relaxed",
};

const BOTON_LATERAL = "flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:hover:bg-transparent";

export default function FilaBloqueTexto({
  bloque, formato, posicion, puedeSubir, puedeBajar,
  onEditar, onBorrar, onMover, onInsertar, onFormato, onTipo,
}: {
  bloque: BloqueTexto;
  formato: FormatoTexto;
  /** Posición visual (1 en adelante), para los rótulos de accesibilidad. */
  posicion: number;
  puedeSubir: boolean;
  puedeBajar: boolean;
  onEditar: (id: number, texto: string) => void;
  onBorrar: (id: number) => void;
  onMover: (id: number, delta: -1 | 1) => void;
  onInsertar: (id: number) => void;
  onFormato: (id: number, cambio: { negrita?: boolean; cursiva?: boolean }) => void;
  onTipo: (id: number, tipo: BloqueTexto["tipo"]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // El textarea crece con el texto: un párrafo largo no debería tener su
  // propia barra de scroll dentro del documento.
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => { ajustar(); }, [ajustar, bloque.texto]);

  return (
    <div className="group relative flex items-start gap-2">
      {bloque.tipo === "lista" && (
        <span aria-hidden className="mt-[0.9rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
      )}
      <textarea
        ref={ref}
        value={bloque.texto}
        onChange={(e) => { onEditar(bloque.id, e.target.value); ajustar(); }}
        rows={1}
        aria-label={`Párrafo ${posicion}${bloque.formatoMixto ? " (formatos mezclados)" : ""}`}
        data-bloque={bloque.id}
        className={`w-full resize-none overflow-hidden rounded-lg bg-transparent px-2 py-1.5 text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] outline-none focus:bg-primary/10 focus:ring-2 focus:ring-[var(--accent)] dark:focus:bg-[var(--accent)]/12 ${ESTILO_TIPO[bloque.tipo]} ${
          bloque.negrita ? "font-bold" : ""
        } ${bloque.cursiva ? "italic" : ""} ${
          bloque.formatoMixto ? "border-l-4 border-[var(--data-warning-500)]" : ""
        } ${bloque.enTabla ? "border-l-4 border-[var(--rule-strong)]" : ""}`}
        title={bloque.enTabla ? "Este párrafo está dentro de una tabla del documento" : undefined}
      />
      <div className="mt-1 flex shrink-0 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        <select
          value={bloque.tipo}
          onChange={(e) => onTipo(bloque.id, e.target.value as BloqueTexto["tipo"])}
          aria-label={`Tipo del párrafo ${posicion}`}
          title="Rol del párrafo en el documento"
          className="h-7 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-xs font-bold text-[var(--text-secondary)] outline-none hover:bg-[var(--surface-canvas)]"
        >
          <option value="parrafo">Normal</option>
          <option value="titulo">Título</option>
          <option value="subtitulo">Subtítulo</option>
          {/* En un .docx no se puede CREAR una lista (la numeración vive
              aparte); la opción sólo aparece si el párrafo ya lo es. */}
          {(formato === "plano" || bloque.tipo === "lista") && <option value="lista">Lista</option>}
        </select>
        {formato === "docx" && (
          <>
            <button type="button"
              className={`${BOTON_LATERAL} ${bloque.negrita ? "bg-primary/10 text-[var(--accent-600)] dark:bg-[var(--accent)]/15 dark:text-[var(--accent)]" : ""}`}
              onClick={() => onFormato(bloque.id, { negrita: !bloque.negrita })}
              title={`Negrita en el párrafo ${posicion}`}>
              <Bold className="h-4 w-4" aria-hidden />
              <span className="sr-only">Negrita párrafo {posicion}</span>
            </button>
            <button type="button"
              className={`${BOTON_LATERAL} ${bloque.cursiva ? "bg-primary/10 text-[var(--accent-600)] dark:bg-[var(--accent)]/15 dark:text-[var(--accent)]" : ""}`}
              onClick={() => onFormato(bloque.id, { cursiva: !bloque.cursiva })}
              title={`Cursiva en el párrafo ${posicion}`}>
              <Italic className="h-4 w-4" aria-hidden />
              <span className="sr-only">Cursiva párrafo {posicion}</span>
            </button>
          </>
        )}
        <button type="button" className={BOTON_LATERAL} disabled={!puedeSubir}
          onClick={() => onMover(bloque.id, -1)} title={`Subir el párrafo ${posicion}`}>
          <ArrowUp className="h-4 w-4" aria-hidden />
          <span className="sr-only">Subir párrafo {posicion}</span>
        </button>
        <button type="button" className={BOTON_LATERAL} disabled={!puedeBajar}
          onClick={() => onMover(bloque.id, 1)} title={`Bajar el párrafo ${posicion}`}>
          <ArrowDown className="h-4 w-4" aria-hidden />
          <span className="sr-only">Bajar párrafo {posicion}</span>
        </button>
        <button type="button" className={BOTON_LATERAL}
          onClick={() => onInsertar(bloque.id)} title={`Insertar un párrafo debajo del ${posicion}`}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="sr-only">Insertar párrafo debajo del {posicion}</span>
        </button>
        <button type="button" className={`${BOTON_LATERAL} hover:text-[var(--data-error-600)]`}
          onClick={() => onBorrar(bloque.id)} title={`Borrar el párrafo ${posicion}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">Borrar párrafo {posicion}</span>
        </button>
      </div>
    </div>
  );
}
