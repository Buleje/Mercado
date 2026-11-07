"use client";

/**
 * La tendencia de las diferencias de los últimos cierres (mejora 11). Vivía
 * arriba de la tabla del Historial de cajas; desde el 10-10 abre Caja ›
 * Historial › Por día, al lado de las cifras por día que la explican.
 */
import { AreaChart, Area, ReferenceLine, ResponsiveContainer } from "recharts";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

interface SparkPoint {
  idx: number;
  diff: number;
  pos: number;
  neg: number;
}

interface Tendencia {
  label: string;
  color: string;
}

interface CashRegisterChartProps {
  sparkData: SparkPoint[];
  diffsCount: number;
  tendencia: Tendencia | null;
}

const ROTULO_TENDENCIA: Record<string, string> = { Mejorando: "Mejorando ↓", Empeorando: "Empeorando ↑", Estable: "→ Estable" };

export default function CashRegisterChart({ sparkData, diffsCount, tendencia }: CashRegisterChartProps) {
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Tendencia de las diferencias</CardTitle>
        <span className="text-sm text-[var(--text-secondary)]">últimos {diffsCount} cierres</span>
        {tendencia && (
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-sm font-semibold", tendencia.color)}>
            {ROTULO_TENDENCIA[tendencia.label] ?? tendencia.label}
          </span>
        )}
      </div>
      <ResponsiveContainer minWidth={0} width="100%" height={60}>
        <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="sparkPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sparkNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--data-error-500)" stopOpacity={0} />
              <stop offset="95%" stopColor="var(--data-error-500)" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <ReferenceLine y={0} stroke="var(--rule-strong)" strokeOpacity={0.4} strokeDasharray="3 3" />
          <Area type="monotone" dataKey="pos" stroke="var(--accent)" fill="url(#sparkPos)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="neg" stroke="var(--data-error-500)" fill="url(#sparkNeg)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-between text-sm text-[var(--text-secondary)]">
        <span>Antes</span>
        <span>Ahora</span>
      </div>
    </section>
  );
}
