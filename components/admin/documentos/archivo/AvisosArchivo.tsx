"use client";

import { useState } from "react";
import AvisosDelArchivo from "../AvisosDelArchivo";
import { fmtFechaCorta, MODOS_CON_LINEA_DE_FOTOS } from "./compartido";
import FotosEscondidas from "../FotosEscondidas";
import { Wand2, CalendarDays, X } from "@buleje/design-system/icons";
import { formatDateLong } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { ModeloArchivo } from "./use-archivo";
import { sinCarpetaRepetida, usePropuestaCarpeta } from "./use-propuesta-carpeta";
import { ListaPropuestas, PastillaPropuesta } from "./PropuestaCarpeta";
export default function AvisosArchivo({ arch }: { arch: ModeloArchivo }) {
  const { vencidosDocs, expiringDocs, expiryBannerDismissed, verVencimientos, setExpiryBannerDismissed,
    sugerenciasIA, aplicarSugerencia, descartarSugerencia, aplicarTodasLasSugerencias, aplicandoTodas,
    setOrdenando, ordenVersion, vistaGeneral, filterMode, fotosEsc, verFotosDeMaquina, scanResult,
    setScanResult, analyzingId, analyzeResult, setAnalyzeResult, error, refresh,
    documents, folders, bulk, hayBusqueda, setMovingDoc } = arch;
  // «¿Va a "X"?» para lo que acabas de subir y quedó suelto (24-10).
  const propuesta = usePropuestaCarpeta({ documents, folders, bulk, refresh, activo: filterMode !== "trash" && !hayBusqueda });
  const [verPropuestas, setVerPropuestas] = useState(false);
  // La pastilla de la IA no repite la carpeta de un papel que ya pregunta «¿Va a…?».
  const sugerencias = sinCarpetaRepetida(sugerenciasIA, propuesta.items);
  const repetidas = sugerencias.length !== sugerenciasIA.length || sugerencias.some((s, i) => s !== sugerenciasIA[i]);
  const [aplicandoSinRepetir, setAplicandoSinRepetir] = useState(false);
  const aplicarTodas = async () => {
    if (!repetidas) return aplicarTodasLasSugerencias();
    setAplicandoSinRepetir(true);
    try {
      for (const { doc, carpeta, vence } of sugerencias) {
        await aplicarSugerencia(doc.id, { ...(carpeta ? { folderId: carpeta.folderId } : {}), ...(vence ? { expiresAt: vence } : {}) })
          .catch((err) => logger.warn("[documentos] sugerencia fail", { docId: doc.id, err: String(err) }));
      }
      await refresh();
    } finally {
      setAplicandoSinRepetir(false);
    }
  };
  const fotos = vistaGeneral && MODOS_CON_LINEA_DE_FOTOS.has(filterMode) && (fotosEsc.conteo?.total ?? 0) > 0
    ? <FotosEscondidas conteo={fotosEsc.conteo} onVerFotos={verFotosDeMaquina} />
    : null;
  const hayPastilla = propuesta.items.length > 0 || propuesta.leyendo.length > 0;
  return (
    <>
      {/* Avisos en una fila: por vencer (la promesa del módulo) y lo que la IA
          sugiere ordenar, cada uno con su acción. */}
      <AvisosDelArchivo
        vencidos={vencidosDocs}
        porVencer={expiringDocs}
        porVencerDescartado={expiryBannerDismissed}
        onVerVencidos={() => verVencimientos("vencidos")}
        onVerPorVencer={() => verVencimientos("porVencer")}
        onDescartarPorVencer={() => setExpiryBannerDismissed(true)}
        sugerencias={sugerencias}
        onAplicar={(id, cambios) => void aplicarSugerencia(id, cambios)}
        onDescartar={descartarSugerencia}
        onAplicarTodas={() => void aplicarTodas()}
        aplicandoTodas={aplicandoTodas || aplicandoSinRepetir}
        fechaCorta={fmtFechaCorta}
        orden={{ onRevisar: () => setOrdenando(true), version: ordenVersion }}
        // Las fotos de las cámaras no se mezclan con tus papeles: la línea que dice
        // cuántas hay va al final de la fila de avisos, no en una fila propia (23-10).
        // «¿Va a…?» va en la misma fila, antes.
        extra={hayPastilla || fotos ? (
          <>
            <PastillaPropuesta modelo={propuesta} abierta={verPropuestas} onAbrir={() => setVerPropuestas((v) => !v)} />
            {fotos}
          </>
        ) : undefined}
      />
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