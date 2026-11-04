"use client";

import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";

// ── Tipos locales (espejo de `MaderaReporte`, sin importar código de servidor) ──

export interface MaderaEspecieDemanda {
  species: string;
  m3: number;
  prevM3: number;
  trendPct: number;
  produccionM3: number;
  despachoM3: number;
  ingresoM3: number;
  negocios: number;
}

export interface MaderaDemanda {
  days: number;
  label: string;
  totalM3: number;
  negocios: number;
  species: MaderaEspecieDemanda[];
}

const fmtM3 = (n: number): string =>
  new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Lo que movió cada fuente, solo las que tienen algo. */
function detalleDe(e: MaderaEspecieDemanda): string {
  const partes: string[] = [];
  if (e.produccionM3 > 0) partes.push(`${fmtM3(e.produccionM3)} producidos`);
  if (e.despachoM3 > 0) partes.push(`${fmtM3(e.despachoM3)} despachados`);
  if (e.ingresoM3 > 0) partes.push(`${fmtM3(e.ingresoM3)} en trozas`);
  return partes.join(" · ");
}

export default function DemandaMaderaSection({ madera }: { madera: MaderaDemanda }) {
  const maximo = Math.max(...madera.species.map((e) => e.m3), 0.001);

  return (
    <SuperadminChartCard
      kicker="Aserraderos"
      title="Madera que se mueve"
      info="Metros cúbicos por especie que los aserraderos produjeron, despacharon o recibieron como trozas en guías de ingreso, contra los mismos días anteriores. Aserrada en pies tablares se pasa a m³ dividiendo entre 424."
      period={madera.label}
    >
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)] tabular-nums">{fmtM3(madera.totalM3)} m³</span>{" "}
        en {madera.species.length} {madera.species.length === 1 ? "especie" : "especies"} ·{" "}
        {madera.negocios} {madera.negocios === 1 ? "aserradero" : "aserraderos"}
      </p>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {madera.species.map((e) => {
          const sube = e.trendPct >= 0;
          const Flecha = sube ? TrendingUp : TrendingDown;
          const detalle = detalleDe(e);
          return (
            <li key={e.species} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
                  {e.species}
                </span>
                <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{fmtM3(e.m3)}</span> m³
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${
                    sube ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                  }`}
                  title={`Antes: ${fmtM3(e.prevM3)} m³`}
                >
                  <Flecha className="w-3.5 h-3.5" aria-hidden />
                  {e.trendPct > 0 ? "+" : ""}
                  {e.trendPct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--data-success-500)]"
                  style={{ width: `${Math.round((e.m3 / maximo) * 100)}%` }}
                  role="presentation"
                />
              </div>
              {detalle && <p className="text-xs text-[var(--text-tertiary)]">{detalle}</p>}
            </li>
          );
        })}
      </ul>
    </SuperadminChartCard>
  );
}
