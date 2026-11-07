"use client";

/**
 * El buscador de la barra de filtros del panel (ADR-489 §2 «Filtros»: barra
 * única = buscador + `SegmentedControl` + un filtro de fecha + filtros-columna,
 * todo a 48 px). Antes cada fila de filtros armaba el suyo: lupa absoluta +
 * `<input>` con sus clases, y cada copia con otro padding, otro foco y otro
 * radio (Guías, Recepciones, Campañas, Movimientos, Acopio de cacao…).
 *
 * - 48 px de alto, texto de 14 px, lupa a la izquierda.
 * - `limpiable`: la «×» de 44 px a la derecha cuando hay texto.
 * - `onEnter`: lo que hace Enter (buscar en el servidor, abrir el primero).
 * - `className` va al contenedor: el ancho dentro de la fila (`sm:max-w-sm`,
 *   `basis-56`…). Por defecto ocupa lo que quede (`flex-1`).
 */
import type { KeyboardEvent, Ref } from "react";
import { Search, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface CampoBuscarProps {
  valor: string;
  onCambiar: (valor: string) => void;
  placeholder: string;
  /** Para el lector de pantalla: «Buscar guías de remisión». */
  etiqueta: string;
  onEnter?: () => void;
  /** Muestra la «×» para vaciar el campo cuando tiene texto. */
  limpiable?: boolean;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export default function CampoBuscar({ valor, onCambiar, placeholder, etiqueta, onEnter, limpiable = false, className, inputRef }: CampoBuscarProps) {
  const alTeclear = onEnter
    ? (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") onEnter();
      }
    : undefined;
  const conCruz = limpiable && valor.length > 0;
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onKeyDown={alTeclear}
        placeholder={placeholder}
        aria-label={etiqueta}
        className={cn(
          "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
          conCruz ? "pr-12" : "pr-3",
          /* Con la «×» propia, la del navegador sobra (Chrome la pinta en `type="search"`). */
          limpiable && "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {conCruz && (
        <button
          type="button"
          onClick={() => onCambiar("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
