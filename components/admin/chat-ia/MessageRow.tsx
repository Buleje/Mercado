"use client";

import { Check, Copy, Loader2, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BotonesDeAccion } from "./BotonesDeAccion";
import { MarkdownContent } from "./MarkdownContent";
import { TarjetasDeAprobacion } from "./TarjetasDeAprobacion";
import type { Message, ResolverAprobacion } from "./tipos";

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 py-2" role="status" aria-label="Generando respuesta">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-tertiary)]"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Una fila de la conversación. La del usuario es una burbuja a la derecha; la
 * del asistente va sin burbuja, con el avatar al lado (el avatar ya dice quién
 * habla: la etiqueta «Asistente IA» de 12 px sobre cada respuesta se fue).
 */
export function MessageRow({
  message,
  isStreaming,
  copied,
  onCopy,
  onResolverAprobacion,
}: {
  message: Message;
  isStreaming: boolean;
  copied: boolean;
  onCopy: () => void;
  onResolverAprobacion: ResolverAprobacion;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        {/* Mismo caso que el botón de enviar: en oscuro, `text-white` sobre
            `--text-primary` deja la burbuja del usuario ilegible. */}
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[var(--text-primary)] px-5 py-3 text-[var(--surface-canvas)]">
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-4">
      <span
        className={cn(
          "mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          message.error
            ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15"
            : "bg-primary/10 dark:bg-primary/15",
        )}
      >
        <Sparkles
          className={cn(
            "h-4 w-4",
            message.error ? "text-[var(--data-error-500)]" : "text-[color:var(--data-success)]",
          )}
          aria-hidden
        />
      </span>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <>
            <MarkdownContent text={message.content} />
            {isStreaming ? (
              <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Escribiendo…
              </span>
            ) : (
              <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
                  title="Copiar respuesta"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : isStreaming ? (
          <StreamingDots />
        ) : null}
        {/* Fuera del `content`: si el modelo no llegó a redactar (429, timeout)
            la acción pendiente y el botón igual tienen que verse — si no, el
            usuario pidió algo, el sistema lo preparó y no hay dónde apretar. */}
        <TarjetasDeAprobacion
          aprobaciones={message.aprobaciones}
          onResolver={onResolverAprobacion}
        />
        <BotonesDeAccion acciones={message.acciones} />
      </div>
    </div>
  );
}
