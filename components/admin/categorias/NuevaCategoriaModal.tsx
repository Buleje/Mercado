"use client";
/** Ventana «Nueva categoría» (movible y fijable, ADR-420). La categoría se agrega a la lista; se guarda con «Guardar cambios». */
import { useCallback, useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Globe, Plus, Tag, X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { button } from "@/components/ui-system/button-variants";
import { slugify } from "./tipos";

export function NuevaCategoriaModal({ abierto, onCerrar, onCrear, storeName }: {
  abierto: boolean;
  onCerrar: () => void;
  /** Devuelve el error a mostrar, o null si la agregó. */
  onCrear: (label: string) => string | null;
  storeName: string;
}) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  // El rol de diálogo va en el MISMO elemento que el hook: con el rol en el
  // fondo y el ref en el panel, el hook veía «otro diálogo» y cedía el teclado.
  const panelRef = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => { setNombre(""); setError(null); onCerrar(); }, [onCerrar]);
  useModalAccesible(panelRef, { onCerrar: cerrar, activo: abierto });
  const ventana = useVentanaDeModal(abierto, { ref: panelRef, aplicarTranslate: true, claveMemoria: "categorias-nueva" });

  useEffect(() => {
    if (!abierto) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [abierto]);

  const crear = () => {
    if (!nombre.trim()) return;
    const err = onCrear(nombre);
    if (err) { setError(err); return; }
    cerrar();
  };

  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-system flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) cerrar(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-cat-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-[var(--shadow-xl)] overflow-hidden outline-none"
      >
        <header {...ventana.asaProps} className="flex items-center gap-3 border-b border-[var(--rule-soft)] px-5 py-4 sm:px-6">
          <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Tag className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <CardTitle as="h2" id="new-cat-title" className="min-w-0 flex-1 font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight truncate">
            Nueva categoría
          </CardTitle>
          <span className="flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="new-cat-name" className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">
              Nombre
            </label>
            <input
              id="new-cat-name"
              autoFocus
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") crear(); }}
              placeholder="Ej: Snacks importados, Cuidado personal…"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-cat-error" : undefined}
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface-raised)]"
            />
            {error && (
              <p id="new-cat-error" role="alert" className="mt-1.5 text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>
            )}
          </div>

          {nombre.trim() && (
            <div className="space-y-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-secondary)]">
              <p className="flex items-center gap-2 font-semibold text-[var(--text-tertiary)]">
                <Globe className="h-4 w-4" aria-hidden /> Vista previa
              </p>
              <p className="break-all font-mono">
                <span className="text-[var(--text-tertiary)]">URL: </span>
                /tienda/categoria/<strong className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{slugify(nombre) || "…"}</strong>
              </p>
              <p>
                <span className="text-[var(--text-tertiary)]">Título SEO: </span>
                <span className="font-semibold text-[var(--text-primary)]">{nombre.trim()} en {storeName} | Compra online con delivery</span>
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-4 sm:px-6">
          <button type="button" onClick={cerrar} className={button({ variant: "ghost", className: "rounded-xl" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={!nombre.trim()}
            className={button({ variant: "primary", className: "rounded-xl gap-1.5" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar categoría
          </button>
        </footer>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
