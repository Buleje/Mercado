/**
 * El pie del detalle del pedido: rechazar y los papeles del pedido (comanda,
 * guía, nota de crédito, boleta). Salió de `OrdersDetailPanel.tsx` (10-10).
 */
import { FileMinus, FileText, Printer, Truck, X } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import type { DbOrder } from "@/lib/jsondb";
import { printComanda } from "./imprimir-comanda";

/** Mismo aspecto para los papeles del pedido: son del mismo peso. px-2.5: con
 *  px-3 «Generar boleta» bajaba a una fila propia a 1280 (737 px contra 728). */
const PAPEL =
  "inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] hover:no-underline dark:hover:text-[var(--accent)]";

export function DetallePie({
  order,
  onRechazar,
}: {
  order: DbOrder;
  onRechazar: (id: string) => void;
}) {
  const enMarcha = order.status !== "cancelado" && order.status !== "entregado";
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-1.5 bg-[var(--surface-raised)] px-5 py-2 sm:px-6">
      {enMarcha && (
        <button
          type="button"
          onClick={() => onRechazar(order.id)}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-2.5 text-sm font-semibold text-[var(--data-error-ink)] transition-colors hover:bg-[var(--data-error-500)]/10"
        >
          <X className="h-4 w-4" aria-hidden />
          Rechazar
        </button>
      )}
      <button type="button" onClick={() => printComanda(order)} className={PAPEL}>
        <Printer className="h-4 w-4" aria-hidden />
        Imprimir comanda
      </button>
      {/* Los otros papeles del pedido (plan «panel unificado» 2026-10-09):
          llevan a su pantalla; el N° de pedido se vincula allá. */}
      <EnlacePanel
        href="/admin?tab=guias-remision"
        apariencia="heredada"
        title={`Abre Guías de remisión para hacer la del pedido #${order.id.slice(-6)}`}
        className={PAPEL}
      >
        <Truck className="h-4 w-4" aria-hidden />
        Hacer guía
      </EnlacePanel>
      <EnlacePanel
        href="/admin?tab=notas-credito"
        apariencia="heredada"
        title={`Abre Notas de crédito para la del pedido #${order.id.slice(-6)}`}
        className={PAPEL}
      >
        <FileMinus className="h-4 w-4" aria-hidden />
        Nota de crédito
      </EnlacePanel>
      <button
        type="button"
        onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
        className={button({ variant: "primary", className: "ml-auto gap-1.5 rounded-xl px-3.5" })}
      >
        <FileText className="h-4 w-4" aria-hidden />
        Generar boleta
      </button>
    </footer>
  );
}
