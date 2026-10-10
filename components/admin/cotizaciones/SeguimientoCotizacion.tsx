"use client";

/**
 * Mejora 5: la línea de tiempo de una cotización (creada → enviada →
 * respuesta → pedido) y, si está enviada, el empujón que corresponde:
 * vencida → renovarla; más de 3 días sin respuesta → recordar por WhatsApp.
 */
import { BlockTitle } from "@buleje/design-system";
import { Check, Clock, MessageCircle, RefreshCw } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { abrirWhatsApp, vencioSinRespuesta, type Cotizacion } from "./tipos";

const ORDEN = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "CONVERTIDA", "VENCIDA"];

export function SeguimientoCotizacion({ c, onRenovar }: { c: Cotizacion; onRenovar: () => void }) {
  const pasos = [
    { label: "Creada", status: "BORRADOR", date: c.createdAt },
    { label: "Enviada", status: "ENVIADA", date: c.status !== "BORRADOR" ? c.updatedAt : null },
    { label: "Aceptada / Rechazada", status: "ACEPTADA", date: c.status === "ACEPTADA" || c.status === "RECHAZADA" ? c.updatedAt : null },
    { label: "Convertida en pedido", status: "CONVERTIDA", date: c.status === "CONVERTIDA" ? c.updatedAt : null },
  ] as const;
  const actual = ORDEN.indexOf(c.status);
  const diasEnviada = Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / 86_400_000);

  return (
    <div>
      <BlockTitle className="mb-3">Seguimiento</BlockTitle>
      <ol>
        {pasos.map((p, idx) => {
          const i = ORDEN.indexOf(p.status);
          const hecho =
            p.status === "BORRADOR" ||
            (p.status === "ACEPTADA" && (c.status === "ACEPTADA" || c.status === "RECHAZADA" || c.status === "CONVERTIDA")) ||
            (actual >= i && i > 0) ||
            (c.status === "CONVERTIDA" && p.status === "CONVERTIDA");
          return (
            <li key={p.status} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", hecho ? "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]")}>
                  {hecho ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
                </span>
                {idx < pasos.length - 1 && <span className={cn("h-6 w-0.5", hecho ? "bg-primary/30" : "bg-[var(--rule-soft)]")} />}
              </div>
              <div className="pb-2">
                <p className={cn("text-sm font-semibold", hecho ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{p.label}</p>
                <p className="text-sm text-[var(--text-secondary)]">{hecho ? (p.date ? formatDate(p.date) : "") : "pendiente"}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {vencioSinRespuesta(c) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/10">
          <p className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">Venció sin respuesta.</p>
          <button type="button" onClick={onRenovar} className={button({ variant: "secondary", className: "ml-auto gap-1.5 rounded-xl" })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Renovar cotización
          </button>
        </div>
      ) : c.status === "ENVIADA" && diasEnviada > 3 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10">
          <p className="text-sm font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">Sin respuesta hace {diasEnviada} días.</p>
          <button
            type="button"
            onClick={() => abrirWhatsApp(`Hola ${c.clienteNombre}, te enviamos la cotización ${c.numero} por ${formatCurrency(Number(c.total))}. ¿Te interesa?`)}
            className={button({ variant: "secondary", className: "ml-auto gap-1.5 rounded-xl" })}
          >
            <MessageCircle className="h-4 w-4 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden /> Recordar por WhatsApp
          </button>
        </div>
      ) : null}
    </div>
  );
}
