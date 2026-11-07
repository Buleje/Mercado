"use client";

import { Loader2, HelpCircle, Lock, Sparkles } from "@buleje/design-system/icons";
import { QUICK_PROMPTS } from "@/components/admin/pos/voz/voz-shared";
import type { DictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";

/** Lo que se oyó, sugerencias, «interpretando», errores y la pregunta de la IA. */
export default function DictadoAvisos({ voz }: { voz: DictadoVoz }) {
  const {
    transcript, interimTranscript, isListening, items, processing, error, clarification,
    handleQuickPrompt, handleClarificationAnswer,
  } = voz;
  return (
    <>
              {/* Transcript grande */}
              {(transcript || interimTranscript) && (
                <div className="rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-5 py-4 mb-4">
                  <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-snug">
                    {transcript}
                    {interimTranscript && (
                      <span className="text-[var(--text-tertiary)] italic">
                        {" "}
                        {interimTranscript}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Empty state: sugerencias rápidas */}
              {!isListening && !transcript && !interimTranscript && items.length === 0 && !processing && !error && (
                <div>
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
                    Prueba decir
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleQuickPrompt(prompt)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Processing */}
              {processing && (
                <div className="flex items-center justify-center gap-2.5 py-4 text-[var(--accent)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <p className="text-sm font-bold">Interpretando lo que dijiste…</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-2xl bg-[var(--data-error-500)]/10 border-2 border-[var(--data-error-500)]/30 p-4">
                  {error === "not-allowed" ? (
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[var(--data-error-500)] leading-tight">
                          Micrófono bloqueado
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                          Toca el ícono del candado en la barra de direcciones del navegador y elige{" "}
                          <strong className="text-[var(--text-primary)]">Permitir</strong> para el micrófono. Después vuelve a este panel.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-[var(--data-error-500)]">{error}</p>
                  )}
                </div>
              )}

              {/* Aclaración */}
              {clarification && (
                <div className="mt-4 rounded-2xl bg-[var(--data-warning-500)]/10 border-2 border-[var(--data-warning-500)]/30 p-4">
                  <div className="flex items-start gap-2.5 mb-3">
                    <HelpCircle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm font-bold text-[var(--data-warning-700,var(--data-warning-500))] leading-relaxed">
                      {clarification.question}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {clarification.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleClarificationAnswer(option)}
                        className="inline-flex items-center rounded-full border-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-raised)] px-3.5 py-1.5 text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--data-warning-500)]/15 transition-colors"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
    </>
  );
}
