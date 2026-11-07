import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/pos/pago/pago-shared";

// ── Mejora 4: Vuelto visual con billetes ──────────────────────────────────────
function calcularVuelto(monto: number): string {
  const denominaciones = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
  const result: string[] = [];
  let restante = monto;
  for (const d of denominaciones) {
    const count = Math.floor(restante / d);
    if (count > 0) {
      result.push(`${count}xS/${d % 1 === 0 ? d : d.toFixed(1)}`);
      restante = Math.round((restante - count * d) * 100) / 100;
    }
  }
  return result.join(" + ");
}

// Colores reales de billetes/monedas peruanos para que cada denominación
// se distinga a simple vista, independiente del brand del tenant.
const DENOM_VISUAL: Record<number, { color: string; shape: "rect" | "circle"; label: string }> = {
  200: { color: "bg-indigo-700 text-white",  shape: "rect",   label: "S/200" },
  100: { color: "bg-emerald-600 text-white", shape: "rect",   label: "S/100" },
  50:  { color: "bg-violet-600 text-white",  shape: "rect",   label: "S/50"  },
  20:  { color: "bg-orange-500 text-white",  shape: "rect",   label: "S/20"  },
  10:  { color: "bg-sky-500 text-white",     shape: "rect",   label: "S/10"  },
  5:   { color: "bg-yellow-400 text-yellow-900", shape: "circle", label: "S/5"   },
  2:   { color: "bg-gray-300 text-[var(--text-primary)]", shape: "circle", label: "S/2"   },
  1:   { color: "bg-gray-400 text-white",    shape: "circle", label: "S/1"   },
  0.5: { color: "bg-amber-700 text-white",   shape: "circle", label: "S/.50" },
  0.2: { color: "bg-amber-800 text-white",   shape: "circle", label: "S/.20" },
};

function VueltoVisual({ monto }: { monto: number }) {
  const denominaciones = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
  const pieces: { denom: number; count: number }[] = [];
  let restante = monto;
  for (const d of denominaciones) {
    const count = Math.floor(restante / d);
    if (count > 0) {
      pieces.push({ denom: d, count });
      restante = Math.round((restante - count * d) * 100) / 100;
    }
  }
  if (pieces.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {pieces.flatMap(({ denom, count }) => {
        const visual = DENOM_VISUAL[denom];
        if (!visual) return [];
        return Array.from({ length: count }, (_, i) => (
          <div
            key={`${denom}-${i}`}
            className={cn(
              "flex items-center justify-center text-[length:var(--ts-2xs)] font-bold",
              visual.color,
              visual.shape === "rect"
                ? "w-10 h-5 rounded"
                : "h-7 min-w-7 rounded-full px-1"
            )}
          >
            {visual.label}
          </div>
        ));
      })}
    </div>
  );
}

/**
 * Lo que hay que devolver, grande y en color, SIEMPRE a la vista mientras se paga
 * en efectivo: «S/ 0.00 · exacto» cuando cuadra y «Falta S/ X» en rojo cuando no
 * alcanza. Antes sólo aparecía con vuelto > 0 y el «Falta» era una caja aparte
 * al final de la tarjeta. Las cifras salen tal cual de `usePagoModal`.
 */
export default function PagoVuelto({ vuelto, pendiente, conVuelto, className }: { vuelto: number; pendiente: number; conVuelto: boolean; className?: string }) {
  if (pendiente > 0.01) {
    return (
      <div
        aria-live="polite"
        data-pago-vuelto="falta"
        className={cn("rounded-2xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3", className)}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--data-error-ink)]">Falta</p>
        <p className="text-3xl font-extrabold leading-tight tabular-nums text-[var(--data-error-ink)] sm:text-4xl">{fmt(pendiente)}</p>
        <p className="mt-1 text-sm text-[var(--data-error-ink)]">Lo recibido no cubre el total.</p>
      </div>
    );
  }
  if (!conVuelto) return null;
  return (
    <div
      aria-live="polite"
      data-pago-vuelto="vuelto"
      className={cn("rounded-2xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-4 py-3", className)}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--data-success-ink)]">Vuelto</p>
      <p className="text-3xl font-extrabold leading-tight tabular-nums text-[var(--data-success-ink)] sm:text-4xl">{fmt(vuelto)}</p>
      {vuelto >= 0.2 ? (
        <>
          <VueltoVisual monto={vuelto} />
          <p className="mt-1.5 text-xs text-[var(--data-success-ink)]">{calcularVuelto(vuelto)}</p>
        </>
      ) : vuelto <= 0 ? (
        <p className="mt-1 text-sm text-[var(--data-success-ink)]">Pago exacto, sin vuelto.</p>
      ) : null}
    </div>
  );
}
