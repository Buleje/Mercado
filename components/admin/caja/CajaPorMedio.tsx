"use client";

/**
 * Ventas por medio de pago (mejora 6), la conciliación Yape/Plin y las ventas
 * por hora, en UN bloque plegable y recordado: es detalle, no lo primero que
 * se mira. Plegado sigue diciendo el reparto en una línea.
 */
import { CardTitle } from "@buleje/design-system";
import { Banknote, ChevronDown, CreditCard, Smartphone } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { ConciliacionYapePlin } from "./ConciliacionYapePlin";
import { fmt, type StatsCaja } from "./tipos";

const ICONO: Record<string, typeof Banknote> = { efectivo: Banknote, yape: Smartphone, plin: Smartphone, tarjeta: CreditCard };

export function CajaPorMedio({ breakdown, stats }: { breakdown: Record<string, number>; stats: StatsCaja | null }) {
  const [abierto, setAbierto] = useLocalStorage<boolean>("caja:por-medio-abierto", false);
  const entradas = Object.entries(breakdown);
  if (entradas.length === 0) return null;
  const total = entradas.reduce((s, [, v]) => s + v, 0);

  const horas = stats?.hourlyData ?? [];
  const activas = horas.map((v, i) => ({ hour: i, value: v })).filter((_, i) => horas[i] > 0 || (i > 0 && horas[i - 1] > 0) || (i < 23 && horas[i + 1] > 0));
  const desde = activas.length ? Math.max(0, activas[0].hour - 1) : 0;
  const hasta = activas.length ? Math.min(23, activas[activas.length - 1].hour + 1) : -1;
  const franja = horas.slice(desde, hasta + 1).map((v, i) => ({ hour: desde + i, value: v }));
  const maxH = Math.max(...horas, 1);

  return (
    <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)]">
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3">
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-controls="caja-por-medio-panel"
          aria-label={abierto ? "Plegar ventas por medio de pago" : "Ver ventas por medio de pago"}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 text-[var(--text-secondary)] transition-transform", abierto && "rotate-180")} aria-hidden />
        </button>
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Ventas por medio de pago</CardTitle>
        {!abierto && (
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] tabular-nums">
            {entradas.map(([m, v], i) => (
              <span key={m}>
                {i > 0 && " · "}
                <span className="capitalize">{m}</span> <span className="font-bold text-[var(--text-primary)]">{fmt(v)}</span>
              </span>
            ))}
          </span>
        )}
      </div>
      <div id="caja-por-medio-panel" hidden={!abierto} className="space-y-4 px-4 sm:px-5 pb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {entradas.map(([m, v]) => {
            const pct = total > 0 ? (v / total) * 100 : 0;
            const Icono = ICONO[m] ?? Banknote;
            return (
              <div key={m} className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icono className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                  <span className="text-xs font-bold capitalize text-[var(--text-secondary)]">{m}</span>
                  <span className="ml-auto text-xs text-[var(--text-tertiary)]">{pct.toFixed(0)}%</span>
                </div>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)]">{fmt(v)}</p>
                <div className="mt-1.5 h-1.5 bg-[var(--rule-soft)] rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {entradas.some(([k]) => k === "yape" || k === "plin") && <ConciliacionYapePlin breakdown={breakdown} />}
          {franja.length > 0 && (
            <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
              <p className="text-xs font-bold text-[var(--text-tertiary)] mb-2">Ventas por hora</p>
              <div className="flex items-end gap-1 h-16">
                {franja.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full bg-primary/80 rounded-t transition-all min-h-[2px]" style={{ height: `${(h.value / maxH) * 48}px` }} title={`${h.hour}:00 — ${fmt(h.value)}`} />
                    <span className="text-xs text-[var(--text-tertiary)]">{h.hour}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
