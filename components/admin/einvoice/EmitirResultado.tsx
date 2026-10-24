"use client";

/**
 * Paso 3 de «Emitir comprobante»: lo que respondió el servidor, dicho como es
 * (F08/F42/F47). Una 202 ya no se pinta como error rojo (B7) y, si la red se
 * cortó, se revisa el pedido antes de dejar reintentar (B3).
 */
import { AlertCircle, CheckCircle2, Clock, ExternalLink, HelpCircle, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ResultadoEmision, TipoResultado } from "./emision-reglas";

const ASPECTO: Record<TipoResultado, { icono: typeof CheckCircle2; color: string }> = {
  aceptado: { icono: CheckCircle2, color: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" },
  enviado: { icono: Clock, color: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" },
  ya_existia: { icono: CheckCircle2, color: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" },
  en_cola: { icono: Clock, color: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" },
  rechazado: { icono: XCircle, color: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
  error: { icono: AlertCircle, color: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
  sin_confirmar: { icono: HelpCircle, color: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" },
};

export function EmitirResultado({ resultado }: { resultado: ResultadoEmision }) {
  const { icono: Icono, color } = ASPECTO[resultado.tipo];
  return (
    <div role="status" data-qa="emitir-resultado" className="flex items-start gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-4">
      <Icono className={cn("mt-0.5 h-6 w-6 shrink-0", color)} aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-base font-bold text-[var(--text-primary)]">{resultado.titulo}</p>
        <p className="text-sm text-[var(--text-secondary)]">{resultado.detalle}</p>
        {resultado.pdfUrl && (
          <a
            href={resultado.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Ver el PDF <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
