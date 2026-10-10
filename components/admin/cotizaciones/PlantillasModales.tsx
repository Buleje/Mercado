"use client";

/**
 * Las plantillas de ítems: elegir una (desde el formulario) o verlas todas,
 * usarlas y borrarlas (desde «Más» o desde el formulario). `aboveModals`:
 * se abren también encima de «Nueva cotización».
 */
import { Bookmark, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { formatDate } from "@/lib/format";
import { MAX_TEMPLATES, type Plantilla } from "./tipos";
import type { Plantillas } from "./use-plantillas";

interface Props {
  plantillas: Plantillas;
  onUsar: (p: Plantilla) => void;
}

function Renglon({ p, children }: { p: Plantilla; children?: React.ReactNode }) {
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Bookmark className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
        <span className="block text-sm text-[var(--text-secondary)]">
          {p.items.length} ítem{p.items.length !== 1 ? "s" : ""} · {formatDate(p.createdAt)}
        </span>
      </span>
      {children}
    </>
  );
}

export function PlantillasModales({ plantillas, onUsar }: Props) {
  const { plantillas: lista, ventana, setVentana, borrar } = plantillas;
  const cerrar = () => setVentana(null);
  const vacio = (
    <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
      Todavía no guardaste plantillas. Abre una cotización y usa «Guardar como plantilla».
    </p>
  );

  return (
    <>
      <AdminModal open={ventana === "elegir"} onClose={cerrar} title="Elegir una plantilla" aboveModals>
        <div className={MODAL_BODY}>
          {lista.length === 0 ? vacio : (
            <ul className="space-y-2">
              {lista.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onUsar(p)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-transparent bg-[var(--surface-sunken)] p-3 text-left transition-colors hover:border-[var(--accent)]">
                    <Renglon p={p} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminModal>

      <AdminModal open={ventana === "gestionar"} onClose={cerrar} title="Plantillas guardadas" description={`${lista.length} de ${MAX_TEMPLATES} · en este navegador`} aboveModals>
        <div className={MODAL_BODY}>
          {lista.length === 0 ? vacio : (
            <ul className="space-y-2">
              {lista.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
                  <Renglon p={p}>
                    <button type="button" onClick={() => onUsar(p)} className={button({ variant: "secondary", className: "shrink-0 rounded-xl px-4" })}>Usar</button>
                    <button
                      type="button"
                      aria-label={`Borrar la plantilla ${p.nombre}`}
                      onClick={() => borrar(p.id)}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-ink)] dark:hover:bg-[var(--data-error-500)]/10 dark:hover:text-[var(--data-error-500)]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </Renglon>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminModal>
    </>
  );
}
