"use client";

/**
 * SupportActions — Acciones post-compra (llamar tienda, cancelar, reportar).
 *
 * "Cancelar pedido" solo se muestra si aún no salió (status confirmed/preparing).
 */
import { useState } from "react";
import { Phone, XCircle, AlertCircle, MessageSquare, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { TrackingStatus } from "@/lib/mocks/order-tracking.mock";

interface Props {
  status: TrackingStatus;
  storePhone?: string;
  storeName?: string;
  onCancelOrder?: () => void;
  className?: string;
}

const QUICK_ISSUES = [
  { key: "not_arrived", label: "No llegó" },
  { key: "incomplete", label: "Llegó incompleto" },
  { key: "wrong", label: "Quiero cambiarlo" },
  { key: "damaged", label: "Llegó dañado" },
] as const;

export function SupportActions({
  status,
  storePhone = "+51 999 000 111",
  storeName = "la tienda",
  onCancelOrder,
  className,
}: Props) {
  const [sentIssue, setSentIssue] = useState<string | null>(null);
  const canCancel = status === "confirmed" || status === "preparing";

  const handleIssue = (key: string) => {
    setSentIssue(key);
    window.setTimeout(() => setSentIssue(null), 2400);
  };

  return (
    <section
      aria-labelledby="tracking-support-heading"
      className={cn(
        "rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-4">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
          Ayuda
        </span>
        <h2
          id="tracking-support-heading"
          className="text-base font-extrabold tracking-tight text-foreground mt-0.5"
        >
          ¿Algo anda mal?
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <a
          href={`tel:${storePhone.replace(/\s+/g, "")}`}
          className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-200 dark:border-card-border hover:border-gray-300 dark:hover:border-card-border/80 text-sm font-bold text-foreground transition-colors"
        >
          <Phone className="h-4 w-4" strokeWidth={1.75} />
          Llamar a {storeName}
        </a>
        {canCancel ? (
          <button
            type="button"
            onClick={onCancelOrder}
            className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-red-200 dark:border-red-900/40 hover:border-red-300 dark:hover:border-red-800/60 text-sm font-bold text-red-600 dark:text-red-400 transition-colors"
          >
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            Cancelar pedido
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-200 dark:border-card-border opacity-60 text-sm font-bold text-muted cursor-not-allowed"
            disabled
            aria-disabled="true"
          >
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            No se puede cancelar
          </button>
        )}
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-card-border">
        <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-muted mb-2">
          Respuestas rápidas
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ISSUES.map((it) => {
            const isSent = sentIssue === it.key;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => handleIssue(it.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-[length:var(--ts-2xs)] font-semibold transition-colors",
                  isSent
                    ? "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300"
                    : "border-gray-200 dark:border-card-border hover:border-gray-300 dark:hover:border-card-border/80 text-foreground",
                )}
              >
                {isSent ? (
                  <>
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                    Recibido
                  </>
                ) : (
                  it.label
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[length:var(--ts-2xs)] text-muted inline-flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-[2px] shrink-0" />
          Si marcaste algo, la tienda se pondrá en contacto contigo en minutos.
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-card-border flex items-center gap-2 text-[length:var(--ts-2xs)] text-muted">
        <MessageSquare className="h-3 w-3 shrink-0" />
        <span>
          También puedes reportar cualquier problema por WhatsApp directo a {storeName}.
        </span>
      </div>
    </section>
  );
}
