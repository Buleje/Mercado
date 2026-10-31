"use client";

/**
 * Una carpeta de «Documentos del permiso» (vista GTF del Libro TH) con sus
 * archivos para elegir, ver, descargar o imprimir. Salió de
 * `GtfDocumentosModal` cuando el modal sumó los papeles de la guía (ADR-482):
 * los papeles se listan con la misma fila que las carpetas del plan, así se
 * eligen juntos para mandarlos por WhatsApp.
 */

import { Download, Eye, FileText, FolderOpen, Printer } from "@buleje/design-system/icons";
import type { ArchivoDelPlan } from "@/lib/forestal/plan-documentos-tipos";
import { fecha, type CarpetaConArchivos } from "./gtf-documentos-acciones";

const ICONO =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

export default function GtfDocumentosCarpeta({
  carpeta: c,
  elegidos,
  imprimiendo,
  onAlternar,
  onVer,
  onDescargar,
  onImprimir,
}: {
  carpeta: CarpetaConArchivos;
  elegidos: ReadonlySet<string>;
  imprimiendo: boolean;
  onAlternar: (id: string) => void;
  onVer: (id: string) => void;
  onDescargar: (a: ArchivoDelPlan) => void;
  onImprimir: (a: ArchivoDelPlan) => void;
}) {
  return (
    <section aria-label={c.nombre} className="rounded-xl border border-[var(--rule-base)]">
      <p className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
        <FolderOpen className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" /> {c.nombre}
        <span className="font-normal text-[var(--text-tertiary)]">· {c.archivos.length}</span>
      </p>
      {c.archivos.length === 0 ? (
        <p className="px-3 py-2 text-xs text-[var(--text-tertiary)]">Sin archivos.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {c.archivos.map((a) => (
            <li key={a.documentId} className="flex items-center gap-2 px-3 py-1">
              <input
                type="checkbox"
                aria-label={`Elegir ${a.nombre}`}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={elegidos.has(a.documentId)}
                onChange={() => onAlternar(a.documentId)}
              />
              <button
                type="button"
                onClick={() => onVer(a.documentId)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--text-primary)] hover:underline"
              >
                <FileText
                  className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
                  aria-hidden="true"
                />
                <span className="truncate">{a.nombre}</span>
                <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                  {fecha(a.uploadedAt)}
                </span>
              </button>
              <button
                type="button"
                className={ICONO}
                aria-label={`Ver ${a.nombre}`}
                title="Ver"
                onClick={() => onVer(a.documentId)}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={ICONO}
                aria-label={`Descargar ${a.nombre}`}
                title="Descargar"
                onClick={() => onDescargar(a)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={ICONO}
                aria-label={`Imprimir ${a.nombre}`}
                title="Imprimir"
                disabled={imprimiendo}
                onClick={() => onImprimir(a)}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
