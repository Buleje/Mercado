"use client";

import { useEffect, useState } from "react";
import { Trash2, X, FolderX, FileWarning, Loader2, Undo2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface BorradoCarpetas {
  /** Llevarse los documentos de adentro a la papelera. */
  conDocumentos: boolean;
  /** Borrar también las subcarpetas (la FK NO las borra: suben a la raíz). */
  incluirSubcarpetas: boolean;
}

/**
 * Confirmación de borrado de carpetas — con la pregunta que faltaba.
 *
 * Antes eran dos `window.confirm()` encadenados y ninguno ofrecía lo que la
 * gente espera: el primero avisaba "los documentos NO se borran: pasan a la
 * raíz" y ahí se acababa la conversación. Quien borraba una carpeta con 80
 * archivos los veía reaparecer sueltos en el drive al recargar, y para esa
 * persona el borrado simplemente no había funcionado.
 *
 * Ahora se elige, con los números a la vista. Lo que va a la papelera se
 * recupera 30 días, así que la opción destacada es la que la gente quiso decir.
 */
export function ConfirmarBorrarCarpetas({
  nombres,
  subcarpetas,
  documentosDirectos,
  documentosEnSubcarpetas,
  onCancelar,
  onConfirmar,
}: {
  /** Nombres de las carpetas marcadas (se muestran las primeras). */
  nombres: string[];
  /** Cuántas subcarpetas cuelgan de las marcadas. */
  subcarpetas: number;
  /** Documentos vivos en las carpetas marcadas. */
  documentosDirectos: number;
  /** Documentos vivos en las subcarpetas que cuelgan. */
  documentosEnSubcarpetas: number;
  onCancelar: () => void;
  onConfirmar: (opciones: BorradoCarpetas) => void | Promise<void>;
}) {
  const [incluirSubcarpetas, setIncluirSubcarpetas] = useState(true);
  const [ocupado, setOcupado] = useState<"papelera" | "sueltos" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !ocupado) onCancelar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancelar, ocupado]);

  const conSub = subcarpetas > 0 && incluirSubcarpetas;
  const documentos = documentosDirectos + (conSub ? documentosEnSubcarpetas : 0);
  const carpetasQueSeVan = nombres.length + (conSub ? subcarpetas : 0);

  const correr = async (conDocumentos: boolean) => {
    if (ocupado) return;
    setOcupado(conDocumentos ? "papelera" : "sueltos");
    try {
      await onConfirmar({ conDocumentos, incluirSubcarpetas: conSub });
    } finally {
      setOcupado(null);
    }
  };

  const visibles = nombres.slice(0, 5);
  const resto = nombres.length - visibles.length;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!ocupado) onCancelar(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Eliminar ${nombres.length} carpeta(s)`}
        className="w-full max-w-[34rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error)]">
            <FolderX className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              ¿Eliminar {nombres.length} carpeta{nombres.length === 1 ? "" : "s"}?
            </p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">
              {visibles.join(", ")}{resto > 0 ? ` y ${resto} más` : ""}
            </p>
          </div>
          <button
            onClick={onCancelar}
            disabled={!!ocupado}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {subcarpetas > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--rule-base)] p-3 hover:bg-[var(--surface-sunken)]">
              <input
                type="checkbox"
                checked={incluirSubcarpetas}
                onChange={(e) => setIncluirSubcarpetas(e.target.checked)}
                disabled={!!ocupado}
                className="mt-0.5 h-4 w-4 accent-[var(--data-error-500)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                Borrar también las <strong className="font-bold text-[var(--text-primary)]">{subcarpetas} subcarpeta{subcarpetas === 1 ? "" : "s"}</strong> que cuelgan.
                {!incluirSubcarpetas && <em className="block text-xs not-italic text-[var(--text-tertiary)]">Si no, quedan sueltas en el drive con lo que tengan adentro.</em>}
              </span>
            </label>
          )}

          {documentos > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Adentro hay <strong className="font-bold text-[var(--text-primary)]">{documentos} documento{documentos === 1 ? "" : "s"}</strong>. Decidí qué hacer con ellos:
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Sin documentos adentro: se {carpetasQueSeVan === 1 ? "va la carpeta vacía" : `van las ${carpetasQueSeVan} carpetas vacías`}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button
            onClick={() => correr(documentos > 0)}
            disabled={!!ocupado}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-[filter]",
              "bg-[var(--data-error-500)] hover:brightness-110 disabled:opacity-60",
            )}
          >
            {ocupado === "papelera" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {documentos > 0
              ? `Eliminar y mandar los ${documentos} documentos a la papelera`
              : `Eliminar ${carpetasQueSeVan === 1 ? "la carpeta" : `las ${carpetasQueSeVan} carpetas`}`}
          </button>

          {documentos > 0 && (
            <button
              onClick={() => correr(false)}
              disabled={!!ocupado}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
            >
              {ocupado === "sueltos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Sólo {carpetasQueSeVan === 1 ? "la carpeta" : "las carpetas"} — dejar los documentos sueltos en el drive
            </button>
          )}

          <button
            onClick={onCancelar}
            disabled={!!ocupado}
            className="mt-1 text-center text-xs font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)] disabled:opacity-60"
          >
            Cancelar
          </button>

          {documentos > 0 && (
            <p className="text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              Lo que va a la papelera se puede recuperar durante 30 días.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
