"use client";

/**
 * Cola de webhooks de Stripe — el contenido de la página `/admin/webhook-queue`,
 * extraído para mostrarlo también como bloque en Configuración › Sistema ›
 * Colas (plan «panel unificado», ola 2).
 *
 * - `WebhooksStripeAcciones` + `WebhooksStripeContenido`: los usa la página,
 *   que conserva su `AdminTabShell` con las acciones en la cabecera.
 * - `WebhooksStripeBloque` (default): el bloque plegable de Colas.
 */
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock, RotateCcw } from "@buleje/design-system/icons";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { DataTable, StatCard } from "@buleje/design-system";
import { EmptyState } from "@/components/admin/EmptyState";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { button } from "@/components/ui-system/button-variants";
import { formatDateTime } from "@/lib/format";
import { useWebhooksStripe, type QueueItem, type WebhooksStripe } from "./use-webhooks-stripe";

/** Zona Lima y 24 h, como todo el panel; «—» sin fecha. */
function fmt(dateStr: string | null) {
  return dateStr ? formatDateTime(dateStr) : "—";
}

function StatusBadge({ item }: { item: QueueItem }) {
  if (item.processedAt) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
        <CheckCircle2 size={12} className="text-[var(--data-success-ink)]" aria-hidden /> Procesado
      </span>
    );
  }
  if (item.attempts >= 6) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
        <AlertTriangle size={12} className="text-[var(--data-error-ink)]" aria-hidden /> Abandonado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
      <Clock size={12} className="text-[var(--data-warning-ink)]" aria-hidden /> Pendiente ({item.attempts}/6)
    </span>
  );
}

/** «Actualizar» + «Reintentar ahora (N)». */
export function WebhooksStripeAcciones({ w }: { w: WebhooksStripe }) {
  return (
    <>
      <button type="button" onClick={w.load} disabled={w.loading} className={button({ variant: "secondary", className: "rounded-xl" })}>
        <RefreshCw className={`h-4 w-4 ${w.loading ? "animate-spin" : ""}`} aria-hidden />
        Actualizar
      </button>
      <button
        onClick={w.triggerReplay}
        type="button"
        disabled={w.replayLoading || w.pending.length === 0}
        className={button({ variant: "primary", className: "rounded-xl" })}
      >
        <RotateCcw className={`h-4 w-4 ${w.replayLoading ? "animate-spin" : ""}`} aria-hidden />
        Reintentar ahora ({w.pending.length})
      </button>
    </>
  );
}

export function WebhooksStripeContenido({ w }: { w: WebhooksStripe }) {
  const { items, loading, deletingId, error, replayResult, pending, abandoned, processed } = w;
  return (
    <>
      {replayResult && (
        <div className={ADMIN_TOKENS.successBanner}>
          Reintento terminado: <strong>{replayResult.replayed} procesados</strong>,{" "}
          {replayResult.failed} fallidos
        </div>
      )}

      {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
        {[
          { label: "Pendientes", value: pending.length, tone: "warning" as const },
          { label: "Abandonados", value: abandoned.length, tone: "error" as const },
          { label: "Procesados", value: processed.length, tone: "success" as const },
        ].map(({ label, value, tone }) => (
          <StatCard key={label} density="compact" label={label} value={value} emphasis={value > 0 ? tone : "neutral"} />
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-label="Cargando los webhooks">
          <LoadingSpinner size={32} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 aria-hidden />} title="Ningún aviso de Stripe espera reintento." className="py-8" />
      ) : (
        <div className={`overflow-hidden ${ADMIN_TOKENS.card}`}>
          <div className="overflow-x-auto">
            <DataTable className="w-full">
              <thead>
                <tr>
                  {["Estado", "Tipo de evento", "Intentos", "Próximo intento", "Creado", "Último error", ""].map((h) => (
                    <th key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <StatusBadge item={item} />
                    </td>
                    <td className="font-mono text-[var(--text-secondary)]">{item.eventType}</td>
                    <td className="text-center text-[var(--text-secondary)]">{item.attempts}</td>
                    <td className="text-[var(--text-tertiary)]">
                      {item.processedAt ? (
                        <span className="text-[var(--data-success-ink)]">{fmt(item.processedAt)}</span>
                      ) : (
                        fmt(item.nextRetryAt)
                      )}
                    </td>
                    <td className="text-[var(--text-tertiary)]">{fmt(item.createdAt)}</td>
                    <td className="max-w-xs truncate text-[var(--data-error-ink)]">
                      {item.lastError ?? "—"}
                    </td>
                    <td>
                      {!item.processedAt && (
                        <IconAction
                          icon={deletingId === item.id ? RefreshCw : Trash2}
                          busy={deletingId === item.id}
                          label="Descartar evento de la cola"
                          tone="danger"
                          onClick={() => w.dismissItem(item.id)}
                          disabled={deletingId === item.id}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}
    </>
  );
}

/** El bloque de Configuración › Sistema › Colas: acciones en una fila y el contenido. */
export default function WebhooksStripeBloque() {
  const w = useWebhooksStripe();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <WebhooksStripeAcciones w={w} />
      </div>
      <WebhooksStripeContenido w={w} />
    </div>
  );
}
