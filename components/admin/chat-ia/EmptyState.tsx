"use client";

import { PenLine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { EJEMPLOS_ANOTAR, PREGUNTAS } from "./preguntas-sugeridas";

const CHIP =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-soft)] px-3 text-left text-sm transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

const ETIQUETA = "text-sm font-bold text-[var(--text-primary)]";

/**
 * El chat vacío: una frase, el ⓘ con el cómo, y dos grupos de chips —lo que se
 * ANOTA y lo que se PREGUNTA—. Un ejemplo de «Anota» va al campo (trae datos
 * de muestra que hay que cambiar); una pregunta se manda tal cual.
 */
export function EmptyState({
  onAnotar,
  onPreguntar,
}: {
  onAnotar: (frase: string) => void;
  onPreguntar: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:px-8 sm:py-5">
      <p className="text-base text-[var(--text-secondary)]">
        Siempre te muestro qué se anota y por cuánto antes de escribirlo.{" "}
        <InfoTip
          title="Cómo se usa el chat"
          what="Cuéntame qué pasó y lo anoto donde va: gastos, ingresos, adelantos y cobros. O pregúntame por tu negocio: respondo con tus datos reales y ejemplos fáciles."
          affects="Nada se escribe sin tu Confirmar. Lo que espera tu OK desde WhatsApp o Telegram lo ves en Comandos IA › Lo que hizo la IA."
          example="Enter manda y Shift+Enter abre otra línea. Con el micrófono, di «listo» para mandar o «cancelar» para borrar. El clip sube el audio de WhatsApp y lo pasa a texto."
          ancho="w-96"
        />
      </p>

      <section aria-labelledby="chat-ia-anota" className="space-y-2">
        <p id="chat-ia-anota" className={cn(ETIQUETA, "flex items-center gap-1.5")}>
          <PenLine className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          Anota
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EJEMPLOS_ANOTAR.map((frase) => (
            <button
              key={frase}
              type="button"
              onClick={() => onAnotar(frase)}
              title="Lo escribo en el campo: cambia los datos y mándalo"
              className={cn(
                CHIP,
                "bg-[var(--surface-sunken)] py-1.5 leading-snug text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              «{frase}»
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="chat-ia-pregunta" className="space-y-2">
        <p id="chat-ia-pregunta" className={ETIQUETA}>
          Pregúntale
        </p>
        <div className="flex flex-wrap gap-2">
          {PREGUNTAS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onPreguntar(q.prompt)}
              title={q.prompt}
              className={cn(
                CHIP,
                "bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <q.icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              {q.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
