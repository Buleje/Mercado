"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Loader2, Scan, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { scanToPdf } from "@/hooks/use-documents";
import { logger } from "@/lib/logger";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { useEscaner } from "./use-escaner";
import { retenerMotorEscaner } from "./motor-escaner";
import { procesarPagina } from "./procesar-pagina";
import { PasoFuentes } from "./PasoFuentes";
import { EditorPagina } from "./EditorPagina";
import { TirasPaginas } from "./TirasPaginas";

/**
 * Escáner de documentos tipo CamScanner: suma páginas (cámara, archivos o del
 * Archivo), recorta con 8 tiradores + perspectiva, aplica filtros por página y
 * exporta un PDF a la carpeta actual vía `scan-to-pdf`.
 */
export function EscanerModal({ folderId, onClose, onDone }: { folderId: string | null; onClose: () => void; onDone: () => void }) {
  const { paginas, agregar, quitar, reordenar, actualizar } = useEscaner();
  const [agregando, setAgregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(panelRef, { onCerrar: onClose, activo: true });
  const ventana = useVentanaDeModal(true, { ref: panelRef, aplicarTranslate: true, claveMemoria: "escaner-doc" });

  useEffect(() => retenerMotorEscaner(), []);

  const vacio = paginas.length === 0;
  const vista: "fuentes" | "editor" | "paginas" = vacio || agregando ? "fuentes" : editandoId ? "editor" : "paginas";
  const editando = editandoId ? paginas.find((p) => p.id === editandoId) : undefined;
  const indiceEdit = editando ? paginas.findIndex((p) => p.id === editando.id) : -1;

  const crear = async () => {
    if (paginas.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const blobs = await Promise.all(
        paginas.map((p) => procesarPagina({ origenBlob: p.origenBlob, quad: p.quad, rotacion: p.rotacion, filtro: p.filtro })),
      );
      await scanToPdf(blobs, nombre.trim() || undefined, folderId);
      onDone();
      onClose();
    } catch (e) {
      logger.warn("[escaner] crear PDF falló", { error: String(e) });
      setError(e instanceof Error ? e.message.slice(0, 120) : "No se pudo crear el PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!ventana.fijado) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div {...ventana.asaProps} className="flex items-center justify-between border-b border-[var(--rule-base)] p-4">
          <CardTitle id={titleId} as="h3" className="inline-flex items-center gap-2 font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">
            <Scan className="h-5 w-5 text-[var(--accent)]" /> Escanear documento
          </CardTitle>
          <span className="flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button onClick={onClose} className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {vista === "fuentes" && (
            <PasoFuentes
              onAgregar={(blobs) => {
                void agregar(blobs);
              }}
              onVolver={paginas.length > 0 ? () => setAgregando(false) : null}
            />
          )}

          {vista === "editor" && editando && (
            <EditorPagina
              pagina={editando}
              indice={indiceEdit}
              total={paginas.length}
              onActualizar={actualizar}
              onListo={() => setEditandoId(null)}
            />
          )}

          {vista === "paginas" && (
            <div className="flex flex-col gap-4">
              <TirasPaginas
                paginas={paginas}
                onEditar={(id) => setEditandoId(id)}
                onQuitar={quitar}
                onReordenar={reordenar}
                onAgregar={() => setAgregando(true)}
              />
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Nombre del documento (opcional)
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: DNI escaneado"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] dark:bg-[var(--surface-sunken)]"
                />
              </label>
              {error && <p className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
            </div>
          )}
        </div>

        {(vista === "paginas" || (vista === "fuentes" && paginas.length > 0)) && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--rule-base)] p-4">
            <span className="text-xs font-semibold text-[var(--text-tertiary)]">{paginas.length} página(s)</span>
            {vista === "fuentes" ? (
              <button
                type="button"
                onClick={() => setAgregando(false)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-600)]"
              >
                Ver páginas ({paginas.length})
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                  Cancelar
                </button>
                <button
                  onClick={crear}
                  disabled={busy || paginas.length === 0}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {busy ? "Creando…" : `Crear PDF (${paginas.length})`}
                </button>
              </div>
            )}
          </div>
        )}
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
