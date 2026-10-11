import { AlertTriangle, CheckCircle, Loader2, Save, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { useEscanerConteo } from "./use-escaner-conteo";

/** Lo ya contado con el escáner, sus diferencias y el botón de guardar. */
export function ListaContados({ e }: { e: ReturnType<typeof useEscanerConteo> }) {
  const { contados, resumen, guardado } = e;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <ul className="divide-y divide-[var(--rule-soft)]">
        {contados.map((item) => {
          const dif = item.physicalStock - item.systemStock;
          return (
            <li key={item.productId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-[var(--text-primary)]">{item.productName}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Sistema: {item.systemStock} · Contado: {item.physicalStock} {item.unit}
                </p>
              </div>
              {dif === 0 ? (
                <span className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                  <CheckCircle className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden /> OK
                </span>
              ) : (
                <span className={cn("flex items-center gap-1 text-sm font-semibold", dif < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]")}>
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {dif > 0 ? "+" : ""}{dif} ({formatCurrency(Math.abs(dif * item.price))})
                </span>
              )}
              <button type="button" onClick={() => e.quitar(item.productId)} aria-label={`Quitar ${item.productName}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-ink)]">
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="text-[var(--text-secondary)]">Contados: <strong className="text-[var(--text-primary)]">{resumen.total}</strong></span>
          <span className="text-[var(--text-secondary)]">
            Con diferencia: <strong className={resumen.conDiferencia > 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]"}>{resumen.conDiferencia}</strong>
          </span>
          <span className="text-[var(--text-secondary)]">
            Diferencia total:{" "}
            <strong className={resumen.valorDiferencia < 0 ? "text-[var(--data-error-ink)]" : resumen.valorDiferencia > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--text-primary)]"}>
              {formatCurrency(resumen.valorDiferencia)}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={e.guardar}
          disabled={guardado === "saving" || guardado === "saved"}
          className={button({ variant: guardado === "error" ? "danger" : "primary", fullWidth: true, className: "rounded-xl" })}
        >
          {guardado === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Guardando…</>}
          {guardado === "saved" && <><CheckCircle className="h-4 w-4" aria-hidden /> Conteo guardado</>}
          {guardado === "error" && <><AlertTriangle className="h-4 w-4" aria-hidden /> No se guardó: reintenta</>}
          {guardado === "idle" && <><Save className="h-4 w-4" aria-hidden /> Guardar conteo</>}
        </button>
      </div>
    </div>
  );
}
