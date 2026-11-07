"use client";

/**
 * CroquisGaleria — los croquis y fotos de los espacios en miniatura
 * (ADR-497). Tocar uno lo agranda; desde ahí se edita o se borra (con
 * deshacer). Subir abre `CroquisModal`.
 */
import { useState } from "react";
import { undoToast } from "@buleje/design-system";
import { Image as IconoImagen, Pencil, Trash2, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { cn } from "@/lib/utils";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { CroquisModal } from "./CroquisModal";
import { MAX_CROQUIS, type Croquis } from "./espacios-config";

const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";

export function CroquisGaleria() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("espacios");
  const { croquis } = datos;
  const [editando, setEditando] = useState<{ inicial: Croquis; esNuevo: boolean } | null>(null);
  const [viendo, setViendo] = useState<string | null>(null);
  const actual = croquis.find((c) => c.id === viendo) ?? null;
  const lleno = croquis.length >= MAX_CROQUIS;
  const subirNuevo = () => setEditando({ inicial: { id: nuevoId(), titulo: "", url: "", nota: "" }, esNuevo: true });

  const guardar = (c: Croquis) =>
    cambiar((prev) => ({ ...prev, croquis: prev.croquis.some((x) => x.id === c.id) ? prev.croquis.map((x) => (x.id === c.id ? c : x)) : [...prev.croquis, c] }));

  const borrar = (c: Croquis) => {
    const indice = croquis.findIndex((x) => x.id === c.id);
    setViendo(null);
    cambiar((prev) => ({ ...prev, croquis: prev.croquis.filter((x) => x.id !== c.id) }));
    undoToast({
      message: `Borraste el croquis ${c.titulo}`,
      onUndo: () =>
        cambiar((prev) => {
          if (prev.croquis.some((x) => x.id === c.id)) return prev;
          const lista = [...prev.croquis];
          lista.splice(Math.min(indice, lista.length), 0, c);
          return { ...prev, croquis: lista };
        }),
    });
  };

  return (
    <section className="space-y-3" aria-label="Croquis">
      <div className="flex flex-wrap items-center gap-2">
        <span className={ROTULO}>Croquis y fotos</span>
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{croquis.length}</span>
        {puedeEditar && croquis.length > 0 && (
          <button type="button" className={cn(button({ variant: "secondary" }), "ml-auto")} onClick={subirNuevo} disabled={lleno} title={lleno ? `Hasta ${MAX_CROQUIS} imágenes` : undefined}>
            <Upload className="size-4" aria-hidden />
            Subir croquis
          </button>
        )}
      </div>

      {croquis.length === 0 ? (
        <EstadoVacio frase="Sin croquis: sube un dibujo o una foto del local, el almacén o la parcela.">
          {puedeEditar && (
            <button type="button" className={button({ variant: "primary" })} onClick={subirNuevo}>
              <Upload className="size-4" aria-hidden />
              Subir croquis
            </button>
          )}
        </EstadoVacio>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {croquis.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setViendo(c.id)}
                className="group block w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-left transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                aria-label={`Agrandar ${c.titulo}`}
              >
                <span className="block aspect-[4/3] bg-[var(--surface-sunken)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el negocio */}
                  <img src={c.url} alt="" loading="lazy" className="size-full object-cover" />
                </span>
                <span className="block p-2.5">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{c.titulo}</span>
                  {c.nota && <span className="block truncate text-xs text-[var(--text-tertiary)]">{c.nota}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {actual && (
        <AdminModal
          open
          onClose={() => setViendo(null)}
          title={actual.titulo}
          icon={IconoImagen}
          size="xl"
          footer={
            <ModalFooter>
              {puedeEditar && (
                <>
                  <button type="button" className={cn(button({ variant: "ghost" }), "mr-auto text-[var(--data-error-ink)]")} onClick={() => borrar(actual)}>
                    <Trash2 className="size-4" aria-hidden />
                    Borrar
                  </button>
                  <button
                    type="button"
                    className={button({ variant: "secondary" })}
                    onClick={() => {
                      setViendo(null);
                      setEditando({ inicial: actual, esNuevo: false });
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                    Editar
                  </button>
                </>
              )}
              <button type="button" className={button({ variant: "primary" })} onClick={() => setViendo(null)}>
                Cerrar
              </button>
            </ModalFooter>
          }
        >
          <div className={cn(MODAL_BODY, "space-y-3")}>
            <a href={actual.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-[var(--surface-sunken)]" title="Abrir en tamaño real">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el negocio */}
              <img src={actual.url} alt={actual.titulo} className="mx-auto max-h-[70vh] w-full object-contain" />
            </a>
            {actual.nota && <p className="text-sm whitespace-pre-line text-[var(--text-secondary)]">{actual.nota}</p>}
          </div>
        </AdminModal>
      )}

      {editando && (
        <CroquisModal key={editando.inicial.id} abierto inicial={editando.inicial} esNuevo={editando.esNuevo} onCerrar={() => setEditando(null)} onGuardar={guardar} />
      )}
    </section>
  );
}
