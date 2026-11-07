"use client";

import ListaSugerenciasIA from "../AvisosDelArchivo";
import AvisosCabecera from "../AvisosCabecera";
import { fmtFechaCorta } from "./compartido";
import { Wand2, CalendarDays, X } from "@buleje/design-system/icons";
import { formatDateLong } from "@/lib/format";
import type { ModeloArchivo } from "./use-archivo";
import { ListaPropuestas } from "./PropuestaCarpeta";
import { useAvisosArchivo } from "./use-avisos-archivo";
export default function AvisosArchivo({ arch }: { arch: ModeloArchivo }) {
  const { aplicarSugerencia, descartarSugerencia, scanResult, setScanResult, analyzingId, analyzeResult,
    setAnalyzeResult, error, refresh, setMovingDoc } = arch;
  const { avisos, propuesta, verPropuestas, sugerencias, verSugerencias } = useAvisosArchivo(arch);
  return (
    <>
      {/* Vencidos · por vencer · ¿Va a…? · lo que sugiere la IA · ordenar · sin
          descripción · fotos escondidas: en la fila de las pestañas de
          Documentos (31-10), tres a la vista según el ancho y todos en «Avisos». */}
      <AvisosCabecera avisos={avisos} enLinea={3} />
      {verSugerencias && (
        <ListaSugerenciasIA
          sugerencias={sugerencias}
          onAplicar={(id, cambios) => void aplicarSugerencia(id, cambios)}
          onDescartar={descartarSugerencia}
          fechaCorta={fmtFechaCorta}
        />
      )}
      {verPropuestas && <ListaPropuestas modelo={propuesta} onOtraCarpeta={setMovingDoc} />}

      {/* Resultado del escaneo IA */}
      {scanResult && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Wand2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-extrabold">Escaneado: {scanResult.name}</p>
            {scanResult.expiresAt ? (
              <p className="flex items-start gap-1.5 mt-0.5">
                <CalendarDays className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                <span>
                  Detecté vencimiento el{" "}
                  <strong>{formatDateLong(scanResult.expiresAt)}</strong>
                  {" "}— te avisaré por WhatsApp antes.
                </span>
              </p>
            ) : (
              <p className="mt-0.5">La IA lo nombró y clasificó. Si vence, agrega la fecha desde el documento.</p>
            )}
          </div>
          <button onClick={() => setScanResult(null)} className="ml-auto p-1 rounded-xl hover:bg-[var(--data-success-500)]/15" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Indicador de análisis IA en curso */}
      {analyzingId && !analyzeResult && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-bold text-[var(--accent)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" /> Analizando el contenido con IA…
        </div>
      )}

      {/* Resultado del análisis IA de contenido */}
      {analyzeResult && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3.5">
          <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-extrabold text-[var(--text-primary)]">Analizado: {analyzeResult.name}</p>
            <p className="mt-0.5 text-[var(--text-secondary)]">{analyzeResult.summary}</p>
            {analyzeResult.keyFacts.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {analyzeResult.keyFacts.slice(0, 6).map((f, i) => (
                  <li key={i} className="rounded-md bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{f}</li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">El asistente IA ya puede responder con el contenido de este documento.</p>
          </div>
          <button onClick={() => setAnalyzeResult(null)} className="shrink-0 rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <X className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => { void refresh(); }} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}
    </>
  );
}