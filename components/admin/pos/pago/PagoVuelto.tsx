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
    <div className="flex flex-wrap gap-1 justify-center mt-2">
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
                : "w-7 h-7 rounded-full"
            )}
          >
            {visual.label}
          </div>
        ));
      })}
    </div>
  );
}

/** Vuelto grande + billetes y monedas que hay que entregar. */
export default function PagoVuelto({ vuelto }: { vuelto: number }) {
  return (
    <>
          {/* Change display */}
          {vuelto > 0 && (
            <div className="bg-[var(--data-success-500)]/10 dark:bg-[var(--data-success-500)]/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 text-center">
              <p className="text-sm text-[var(--data-success-500)] font-semibold uppercase tracking-wide">
                Vuelto
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1 tabular-nums">
                {fmt(vuelto)}
              </p>
              {vuelto >= 0.2 && (
                <>
                  <VueltoVisual monto={vuelto} />
                  <p className="text-sm text-[var(--data-success-500)]/80 dark:text-[var(--data-success-500)]/80 mt-2 flex items-center justify-center gap-1">
                    <span>{calcularVuelto(vuelto)}</span>
                  </p>
                </>
              )}
            </div>
          )}
    </>
  );
}
