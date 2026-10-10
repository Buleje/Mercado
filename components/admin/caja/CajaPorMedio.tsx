"use client";

/**
 * Caja › Hoy › Medios de pago: las ventas de la caja abierta por medio de
 * pago (mejora 6), el cruce Yape/Plin con la app y las ventas por hora.
 * Hasta el 10-10 era un bloque plegable al fondo de «Hoy»; ahora es su propia
 * sección y se ve entera.
 */
import { CardTitle } from "@buleje/design-system";
import { Banknote, CreditCard, Smartphone } from "@buleje/design-system/icons";
import { ConciliacionYapePlin } from "./ConciliacionYapePlin";
import { fmt, type StatsCaja } from "./tipos";

const ICONO: Record<string, typeof Banknote> = { efectivo: Banknote, yape: Smartphone, plin: Smartphone, tarjeta: CreditCard };

const MARCO = "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

export function CajaPorMedio({ breakdown, stats }: { breakdown: Record<string, number>; stats: StatsCaja | null }) {
  const entradas = Object.entries(breakdown);
  if (entradas.length === 0) {
    return <p className={`${MARCO} p-6 text-center text-sm font-semibold text-[var(--text-secondary)]`}>Todavía no hay ventas en esta caja.</p>;
  }
  const total = entradas.reduce((s, [, v]) => s + v, 0);

  const horas = stats?.hourlyData ?? [];
  const activas = horas.map((v, i) => ({ hour: i, value: v })).filter((_, i) => horas[i] > 0 || (i > 0 && horas[i - 1] > 0) || (i < 23 && horas[i + 1] > 0));
  const desde = activas.length ? Math.max(0, activas[0].hour - 1) : 0;
  const hasta = activas.length ? Math.min(23, activas[activas.length - 1].hour + 1) : -1;
  const franja = horas.slice(desde, hasta + 1).map((v, i) => ({ hour: desde + i, value: v }));
  const maxH = Math.max(...horas, 1);

  return (
    <div className="space-y-4">
      <section aria-label="Ventas por medio de pago" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {entradas.map(([m, v]) => {
          const pct = total > 0 ? (v / total) * 100 : 0;
          const Icono = ICONO[m] ?? Banknote;
          return (
            <div key={m} className={`${MARCO} p-3`}>
              <div className="mb-1 flex items-center gap-2">
                <Icono className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                <span className="text-sm font-semibold capitalize text-[var(--text-secondary)]">{m}</span>
                <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">{pct.toFixed(0)}%</span>
              </div>
              <p className="font-mono text-lg font-extrabold text-[var(--text-primary)]">{fmt(v)}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--rule-soft)]">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {entradas.some(([k]) => k === "yape" || k === "plin") && <ConciliacionYapePlin breakdown={breakdown} />}
        {franja.length > 0 && (
          <section className={`${MARCO} p-4`}>
            <CardTitle className="mb-2 text-sm font-bold text-[var(--text-primary)]">Ventas por hora</CardTitle>
            <div className="flex h-20 items-end gap-1">
              {franja.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-0.5">
                  <div className="min-h-[2px] w-full rounded-t bg-primary/80 transition-all" style={{ height: `${(h.value / maxH) * 56}px` }} title={`${h.hour}:00 — ${fmt(h.value)}`} />
                  <span className="text-sm text-[var(--text-secondary)]">{h.hour}h</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
