"use client";

/**
 * Los avisos del Archivo en UNA fila (11-10): «N por vencer» y «la IA sugiere
 * ordenar» eran dos carteles apilados —el rojo de ancho completo y el de la IA
 * con una tarjeta por archivo— que empujaban los documentos medio alto de
 * pantalla más abajo. Ahora cada uno es una pastilla con su acción, y la lista
 * de sugerencias se abre sólo si la pides («Revisar»).
 */

import { useState } from "react";
import { AlarmClock, Check, ChevronDown, ChevronUp, Sparkles, X } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

export interface SugerenciaIA {
  doc: DbDocument;
  carpeta: { folderId: string; folderName: string } | null;
  vence: string | null;
}

interface Props {
  /** Documentos que vencen en 30 días (ya filtrados), con los días que faltan. */
  porVencer: { d: DbDocument; n: number }[];
  /** El aviso de vencimientos se cerró en esta visita. */
  porVencerDescartado: boolean;
  onVerPorVencer: () => void;
  onDescartarPorVencer: () => void;
  sugerencias: SugerenciaIA[];
  onAplicar: (docId: string, cambios: { folderId?: string; expiresAt?: string }) => void;
  onDescartar: (docId: string) => void;
  onAplicarTodas: () => void;
  aplicandoTodas: boolean;
  /** «15/01/2027» */
  fechaCorta: (iso: string) => string;
}

const SEGMENTO =
  "inline-flex h-12 shrink-0 items-center gap-1.5 border-l px-3 text-sm font-bold transition-colors disabled:opacity-60";

export default function AvisosDelArchivo({
  porVencer, porVencerDescartado, onVerPorVencer, onDescartarPorVencer,
  sugerencias, onAplicar, onDescartar, onAplicarTodas, aplicandoTodas, fechaCorta,
}: Props) {
  const [revisando, setRevisando] = useState(false);
  const verVencer = porVencer.length > 0 && !porVencerDescartado;
  const verSugerencias = sugerencias.length > 0;
  if (!verVencer && !verSugerencias) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {verVencer && (
          <div
            role="status"
            className="inline-flex items-stretch overflow-hidden rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
          >
            <span className="inline-flex items-center gap-2 pl-3 pr-2 text-sm font-bold">
              <AlarmClock className="h-4 w-4 shrink-0" aria-hidden />
              {porVencer.length} por vencer en 30 días
              <InfoTip
                title="Documentos por vencer"
                what={
                  <span>
                    {porVencer.slice(0, 5).map(({ d, n }) => `${d.name} (${n < 0 ? "vencido" : n === 0 ? "vence hoy" : `${n}d`})`).join(" · ")}
                    {porVencer.length > 5 ? ` y ${porVencer.length - 5} más` : ""}
                  </span>
                }
                affects={<span>Te avisamos por WhatsApp y en el panel unos 7 días antes de cada vencimiento.</span>}
              />
            </span>
            <button
              type="button"
              onClick={onVerPorVencer}
              className={cn(SEGMENTO, "border-[var(--data-error-500)]/30 hover:bg-[var(--data-error-500)]/10")}
            >
              Ver
            </button>
            <button
              type="button"
              onClick={onDescartarPorVencer}
              aria-label="Descartar aviso"
              title="Ocultar hasta la próxima visita"
              className={cn(SEGMENTO, "w-12 justify-center px-0 border-[var(--data-error-500)]/30 hover:bg-[var(--data-error-500)]/10")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {verSugerencias && (
          <div className="inline-flex items-stretch overflow-hidden rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <span className="inline-flex items-center gap-2 pl-3 pr-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              {/* A 400 px la pastilla entera tiene que entrar en una línea con sus dos botones. */}
              <span className="whitespace-nowrap max-sm:hidden">
                La IA sugiere ordenar {sugerencias.length === 1 ? "1 archivo" : `${sugerencias.length} archivos`}
              </span>
              <span className="whitespace-nowrap sm:hidden">{sugerencias.length} por ordenar</span>
              <InfoTip
                title="Sugerencias de la IA"
                what={<span>Al leer cada archivo, la IA propone la carpeta donde va y la fecha en que vence.</span>}
                affects={<span>Aplicarla lo mueve a esa carpeta y el vencimiento entra a tus avisos por WhatsApp.</span>}
              />
            </span>
            <button
              type="button"
              onClick={() => setRevisando((v) => !v)}
              aria-expanded={revisando}
              className={cn(SEGMENTO, "border-[var(--accent)]/30 hover:bg-[var(--accent)]/10")}
            >
              Revisar {revisando ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </button>
            {sugerencias.length > 1 && (
              <button
                type="button"
                onClick={onAplicarTodas}
                disabled={aplicandoTodas}
                title="Guardar las carpetas y los vencimientos sugeridos de todos"
                className={cn(SEGMENTO, "border-[var(--accent)]/30 hover:bg-[var(--accent)]/10")}
              >
                {aplicandoTodas
                  ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> Aplicando…</>
                  : <>Aplicar {sugerencias.length === 2 ? "las 2" : `las ${sugerencias.length}`}</>}
              </button>
            )}
          </div>
        )}
      </div>

      {verSugerencias && revisando && (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-raised)]">
          {sugerencias.map(({ doc, carpeta, vence }) => (
            <li key={doc.id} className="flex items-center gap-2 pl-3">
              <div className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-sm font-bold text-[var(--text-primary)]" title={doc.name}>{doc.name}</span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {carpeta && <>mover a <b className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{carpeta.folderName}</b></>}
                  {carpeta && vence && " · "}
                  {vence && <>vence el <b className="text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{fechaCorta(vence)}</b></>}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAplicar(doc.id, {
                  ...(carpeta ? { folderId: carpeta.folderId } : {}),
                  ...(vence ? { expiresAt: vence } : {}),
                })}
                title="Aplicar la sugerencia"
                aria-label={`Aplicar la sugerencia para ${doc.name}`}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
              >
                <Check className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onDescartar(doc.id)}
                aria-label={`Descartar sugerencia para ${doc.name}`}
                title="Descartar"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
