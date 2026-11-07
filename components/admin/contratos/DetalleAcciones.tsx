"use client";

import { Eye, Download, Loader2, Save, FileText, ClipboardCopy, Copy } from "@buleje/design-system/icons";
import type { DbContract } from "@/lib/types/contracts";
import type { EstadoContratos } from "./use-contratos";
export default function DetalleAcciones({ arch }: { arch: EstadoContratos }) {
  const { verPDF, downloadPDF, archivarEnDrive, archivando, detalle, archivoError, downloadWord,
    copyToClipboard, duplicarContrato } = arch;
  /* La ficha sólo se monta con un contrato abierto (la condición vive en ContratosModule). */
  const selected = arch.selected as DbContract;
  return (
    <>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => verPDF(selected)} className="flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">
                      <Eye className="h-4 w-4" /> Ver PDF
                    </button>
                    <button onClick={() => downloadPDF(selected)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-muted)] transition-colors">
                      <Download className="h-4 w-4" /> Descargar
                    </button>
                  </div>

                  {/* Guardar en el drive: de ahí salen la búsqueda, la IA, los permisos y el aviso de vencimiento */}
                  <button
                    onClick={() => archivarEnDrive(selected)}
                    disabled={archivando === selected.id}
                    // En dark el brand-ink es casi negro: sin borde el botón se
                    // funde con el panel y parece un hueco, no una acción.
                    className="w-full flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-[var(--brand-ink)] border border-transparent dark:border-white/20 hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {archivando === selected.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Save className="h-4 w-4" />}
                    {(detalle?.documentId ?? selected.documentId)
                      ? "Actualizar en Documentación"
                      : "Guardar en Documentación"}
                  </button>
                  {(detalle?.documentId ?? selected.documentId) && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
                      Archivado en Documentación · se busca por su texto, la IA lo lee y te avisa antes de que venza.
                    </p>
                  )}
                  {archivoError && (
                    <p className="text-xs text-[var(--data-error-500)] text-center">{archivoError}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => downloadWord(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
                      <FileText className="h-3.5 w-3.5" /> Word
                    </button>
                    <button onClick={() => copyToClipboard(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
                      <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <button onClick={() => duplicarContrato(selected)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold text-secondary bg-secondary/10 hover:bg-secondary/20 transition-colors">
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </button>
                  </div>
                </div>
    </>
  );
}