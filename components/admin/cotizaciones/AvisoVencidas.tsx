"use client";

/**
 * Enviadas que vencieron sin respuesta (Mejora 10): una línea con la cuenta,
 * el detalle en la ⓘ y las dos salidas — renovarlas o darlas por vencidas.
 */
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import type { Cotizacion } from "./tipos";

interface Props {
  vencidas: readonly Cotizacion[];
  procesando: boolean;
  onRenovar: () => void;
  onMarcar: () => void;
}

export function AvisoVencidas({ vencidas, procesando, onRenovar, onMarcar }: Props) {
  if (vencidas.length === 0) return null;
  const n = vencidas.length;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 dark:bg-[var(--data-warning-500)]/10">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <span className="text-sm font-semibold text-[var(--text-primary)]">
        {n === 1 ? "1 cotización enviada venció sin respuesta" : `${n} cotizaciones enviadas vencieron sin respuesta`}
      </span>
      <InfoTip
        title="Vencidas sin respuesta"
        what={
          <span>
            {vencidas.slice(0, 5).map((c) => `${c.numero} · ${c.clienteNombre} (${formatCurrency(c.total)})`).join(" — ")}
            {n > 5 ? ` y ${n - 5} más.` : "."}
          </span>
        }
        affects="«Renovar» crea una copia de cada una, válida 15 días desde hoy, y pasa la original a Cerradas; «Marcar vencidas» sólo las pasa a Cerradas."
      />
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onRenovar} disabled={procesando} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
          {procesando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Renovar
        </button>
        {/* Las dos en secundario: la acción principal de la pantalla es «Nueva cotización». */}
        <button type="button" onClick={onMarcar} disabled={procesando} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
          Marcar vencidas
        </button>
      </div>
    </div>
  );
}
