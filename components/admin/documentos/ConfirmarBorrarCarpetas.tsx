"use client";

import { useCallback, useState } from "react";
import { Trash2, FolderX, FileWarning, Loader2, Undo2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Botones de texto largo: parten la línea en vez de salirse del pie a 400 px. */
const LARGO = "h-auto min-h-12 whitespace-normal py-2 text-center";

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
  const cerrar = useCallback(() => {
    if (!ocupado) onCancelar();
  }, [ocupado, onCancelar]);

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
    <AdminModal
      open
      onClose={cerrar}
      title={`¿Eliminar ${nombres.length} carpeta${nombres.length === 1 ? "" : "s"}?`}
      description={`${visibles.join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`}
      icon={FolderX}
      size="md"
      aboveModals
      claveVentana="confirmar-borrar-carpetas"
      footer={
        <ModalFooter
          nota={
            documentos > 0
              ? "Lo que va a la papelera se puede recuperar durante 30 días."
              : undefined
          }
        >
          <button
            onClick={onCancelar}
            disabled={!!ocupado}
            className={button({ variant: "secondary" })}
          >
            Cancelar
          </button>
          {documentos > 0 && (
            <button
              onClick={() => correr(false)}
              disabled={!!ocupado}
              className={button({ variant: "secondary", className: LARGO })}
            >
              {ocupado === "sueltos" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Sólo {carpetasQueSeVan === 1 ? "la carpeta" : "las carpetas"} — dejar los documentos
              sueltos en el drive
            </button>
          )}
          <button
            onClick={() => correr(documentos > 0)}
            disabled={!!ocupado}
            className={button({ variant: "danger", className: LARGO })}
          >
            {ocupado === "papelera" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {documentos > 0
              ? `Eliminar y mandar los ${documentos} documentos a la papelera`
              : `Eliminar ${carpetasQueSeVan === 1 ? "la carpeta" : `las ${carpetasQueSeVan} carpetas`}`}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
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
              Borrar también las{" "}
              <strong className="font-bold text-[var(--text-primary)]">
                {subcarpetas} subcarpeta{subcarpetas === 1 ? "" : "s"}
              </strong>{" "}
              que cuelgan.
              {!incluirSubcarpetas && (
                <em className="block text-xs not-italic text-[var(--text-tertiary)]">
                  Si no, quedan sueltas en el drive con lo que tengan adentro.
                </em>
              )}
            </span>
          </label>
        )}

        {documentos > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Adentro hay{" "}
              <strong className="font-bold text-[var(--text-primary)]">
                {documentos} documento{documentos === 1 ? "" : "s"}
              </strong>
              . Decide qué hacer con ellos:
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Sin documentos adentro: se{" "}
            {carpetasQueSeVan === 1
              ? "va la carpeta vacía"
              : `van las ${carpetasQueSeVan} carpetas vacías`}
            .
          </p>
        )}
      </div>
    </AdminModal>
  );
}
