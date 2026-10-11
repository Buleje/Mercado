"use client";

/**
 * Producción: lo producido en las últimas semanas, las recetas que más se
 * hacen y el historial de lotes. Los lotes se crean desde «Producir» en la
 * lista de Recetas; los totales del mes están en el panel de Indicadores.
 */
import { useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Layers } from "@buleje/design-system/icons";
import { CardTitle, DataTable, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatDate } from "@/lib/format";
import { lotesPorSemana, masProducidas } from "./produccion-calculos";
import { PER_PAGE, type LoteProducido } from "./tipos";

interface Props {
  lotes: readonly LoteProducido[];
  loading: boolean;
  onIrARecetas: () => void;
}

const TICK = { fontSize: 14, fill: "var(--text-secondary)" };

export function VistaProduccion({ lotes, loading, onIrARecetas }: Props) {
  const [pagina, setPagina] = useState(1);
  const semanas = useMemo(() => lotesPorSemana(lotes), [lotes]);
  const top = useMemo(() => masProducidas(lotes), [lotes]);

  if (loading) return <LoadingState />;
  if (lotes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
        <Layers className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Aún no has producido ningún lote.</p>
        <button type="button" onClick={onIrARecetas} className={button({ variant: "secondary", className: "rounded-xl" })}>Ir a Recetas para producir</button>
      </div>
    );
  }

  const paginas = Math.max(1, Math.ceil(lotes.length / PER_PAGE));
  const actual = Math.min(pagina, paginas);
  const visibles = lotes.slice((actual - 1) * PER_PAGE, actual * PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-2 text-sm font-bold text-[var(--text-primary)]">Lotes por semana (últimas 4)</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={160}>
            <BarChart data={semanas}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-base)" />
              <XAxis dataKey="semana" tick={TICK} />
              <YAxis allowDecimals={false} tick={TICK} width={32} />
              <Tooltip
                formatter={(v, name) => [name === "lotes" ? `${Number(v)} lotes` : formatCurrency(Number(v)), name === "lotes" ? "Lotes" : "Costo total"]}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--rule-base)", background: "var(--surface-raised)", fontSize: 14 }}
              />
              <Bar dataKey="lotes" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-2 text-sm font-bold text-[var(--text-primary)]">Las más producidas</CardTitle>
          <ol className="space-y-2">
            {top.map((r, i) => (
              <li key={r.nombre} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dark)] text-sm font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{r.nombre}</span>
                <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{r.unidades}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <DataTable className="[&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal">
        <thead>
          <tr>
            <th>Receta</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">Costo real</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((l) => (
            <tr key={l.id}>
              <td className="text-sm font-medium text-[var(--text-primary)]">{l.recetaNombre ?? l.recetaId}</td>
              <td className="text-right text-sm tabular-nums text-[var(--text-primary)]">{l.cantidad}</td>
              <td className="text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(l.costoReal)}</td>
              <td className="text-sm text-[var(--text-secondary)]">{formatDate(l.producidoEn)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {paginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)]">{lotes.length} lotes — pág. {actual}/{paginas}</p>
          <div className="flex gap-2">
            <button type="button" aria-label="Anterior" disabled={actual <= 1} onClick={() => setPagina(actual - 1)} className={button({ variant: "secondary", className: "w-12 rounded-xl px-0" })}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Siguiente" disabled={actual >= paginas} onClick={() => setPagina(actual + 1)} className={button({ variant: "secondary", className: "w-12 rounded-xl px-0" })}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
