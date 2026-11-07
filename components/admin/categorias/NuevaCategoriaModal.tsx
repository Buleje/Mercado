"use client";
/** Ventana «Nueva categoría» (movible y fijable, ADR-420). La categoría se agrega a la lista; se guarda con «Guardar cambios». */
import { useCallback, useState } from "react";
import { Globe, Plus, Tag } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { slugify } from "./tipos";

export function NuevaCategoriaModal({
  abierto,
  onCerrar,
  onCrear,
  storeName,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Devuelve el error a mostrar, o null si la agregó. */
  onCrear: (label: string) => string | null;
  storeName: string;
}) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cerrar = useCallback(() => {
    setNombre("");
    setError(null);
    onCerrar();
  }, [onCerrar]);

  const crear = () => {
    if (!nombre.trim()) return;
    const err = onCrear(nombre);
    if (err) {
      setError(err);
      return;
    }
    cerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={cerrar}
      title="Nueva categoría"
      icon={Tag}
      claveVentana="categorias-nueva"
      footer={
        <ModalFooter>
          <button type="button" onClick={cerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={!nombre.trim()}
            className={button({ variant: "primary", className: "gap-1.5" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar categoría
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div>
          <label
            htmlFor="new-cat-name"
            className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]"
          >
            Nombre
          </label>
          <input
            id="new-cat-name"
            autoFocus
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") crear();
            }}
            placeholder="Ej: Snacks importados, Cuidado personal…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-cat-error" : undefined}
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface-raised)]"
          />
          {error && (
            <p
              id="new-cat-error"
              role="alert"
              className="mt-1.5 text-sm font-semibold text-[var(--data-error-ink)]"
            >
              {error}
            </p>
          )}
        </div>

        {nombre.trim() && (
          <div className="space-y-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-secondary)]">
            <p className="flex items-center gap-2 font-semibold text-[var(--text-tertiary)]">
              <Globe className="h-4 w-4" aria-hidden /> Vista previa
            </p>
            <p className="break-all font-mono">
              <span className="text-[var(--text-tertiary)]">URL: </span>
              /tienda/categoria/
              <strong className="text-[var(--accent-ink)] dark:text-[var(--accent)]">
                {slugify(nombre) || "…"}
              </strong>
            </p>
            <p>
              <span className="text-[var(--text-tertiary)]">Título SEO: </span>
              <span className="font-semibold text-[var(--text-primary)]">
                {nombre.trim()} en {storeName} | Compra online con delivery
              </span>
            </p>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
