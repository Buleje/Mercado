"use client";

import { FolderTree } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";

/**
 * El árbol de la carpeta en grande cuando la sección es mediana (880-1100 px,
 * una pantalla de 1280): una franja de 48 px con su botón, y el árbol se abre
 * ENCIMA de la tabla. Así los detalles caben al costado en vez de bajar.
 */
export default function CarpetaAmpliaRiel({ abierto, setAbierto, donde, children }: {
  abierto: boolean;
  setAbierto: (v: boolean | ((v: boolean) => boolean)) => void;
  /** La carpeta que se está mirando (va al tooltip y al lector de pantalla). */
  donde: string;
  children: React.ReactNode;
}) {
  return (
    <aside aria-label="Subcarpetas" className="relative min-w-0 self-start" data-qa="amplia-riel">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="amplia-arbol-flotante"
        title={`Carpetas · ${donde}`}
        aria-label={`Carpetas: estás en ${donde}`}
        className={button({ variant: abierto ? "primary" : "secondary", size: "icon" })}
      >
        <FolderTree className="h-5 w-5" />
      </button>
      {abierto && (
        <div
          id="amplia-arbol-flotante"
          className="absolute left-0 top-14 z-10 max-h-[70dvh] w-72 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
          onKeyDown={(ev) => { if (ev.key === "Escape") { ev.stopPropagation(); setAbierto(false); } }}
        >
          {children}
        </div>
      )}
    </aside>
  );
}
