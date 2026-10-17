"use client";

import { BadgePercent, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";

/** Lo que devuelve `POST /api/compras/recepciones` en `credito`. */
export type CreditoDeRecepcion = {
  total: number;
  descontado: number;
  aFavor: number;
  payableId: string | null;
  reclamoId: string | null;
  detalle: string;
};

/** Pide a ComprasModule cambiar de sub-vista (lo escucha desde Punto de Compra). */
function irA(vista: string) {
  window.dispatchEvent(new CustomEvent("compras-navigate-tab", { detail: vista }));
}

/**
 * Aviso tras recibir con dañados, vencidos o faltantes: cuánto se bajó de la
 * cuenta por pagar y cuánto quedó como reclamo al proveedor.
 */
export default function AvisoCreditoRecepcion({ credito, proveedor, onCerrar }: { credito: CreditoDeRecepcion; proveedor: string; onCerrar: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3">
      <BadgePercent className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-sm text-[var(--text-primary)]">
        <p className="flex flex-wrap items-center gap-x-1.5">
          <span>
            Llegó mal o no llegó: <strong className="tabular-nums">{formatCurrency(credito.total)}</strong> ({credito.detalle}).
          </span>
          <InfoTip
            title="No le pagas lo que no recibiste"
            what="Lo dañado y lo vencido no entran al stock vendible; lo faltante no llegó. Su valor, al precio que te cobra el proveedor (con el descuento de la orden), se baja de la cuenta por pagar de esa orden."
            affects="Si la cuenta ya estaba pagada o la compra fue al contado, lo que sobra queda como reclamo pendiente en Devoluciones: ahí pides la nota de crédito, la reposición o el reembolso."
            example="Orden de S/ 140 a crédito, 2 sacos de arroz de S/ 10 llegan rotos: la cuenta queda en S/ 120."
          />
        </p>
        {credito.descontado > 0 && (
          <p>
            Bajamos <strong className="tabular-nums">{formatCurrency(credito.descontado)}</strong> de tu cuenta con {proveedor}.{" "}
            <button type="button" onClick={() => irA("cuentas-por-pagar")} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
              Ver la cuenta
            </button>
          </p>
        )}
        {credito.aFavor > 0 && (
          <p>
            <strong className="tabular-nums">{formatCurrency(credito.aFavor)}</strong> quedaron como reclamo: {proveedor} te los debe.{" "}
            <button type="button" onClick={() => irA("devoluciones")} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
              Ver en Devoluciones
            </button>
          </p>
        )}
      </div>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
