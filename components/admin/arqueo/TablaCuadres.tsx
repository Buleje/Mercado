"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Calculator, CheckCircle2, Eye, Search } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { FILTROS, STATUS_MAP, dentroDeTolerancia, fmt, fmtSigno, horaLima, type CashAudit, type FiltroCuadre } from "./arqueo-shared";

const PAGINA = 20;

/**
 * Historial de cuadres con sus filtros pegados. `GET /api/cash-registers`
 * devuelve TODAS las cajas: con un año de cierres diarios la tabla pasaba de
 * 300 filas, así que se muestran de a 20 («Ver más»).
 *
 * El buscador (fecha, cajero o nota) vino de la tabla del Historial de cajas,
 * que repetía esta y se fue el 10-10. De ella vino también la tolerancia del
 * negocio: una diferencia de hasta ± `tolerancia` sale «Dentro de tolerancia».
 */
export default function TablaCuadres({
  audits,
  onVer,
  onIrACaja,
  tolerancia,
}: {
  audits: CashAudit[];
  onVer: (a: CashAudit) => void;
  onIrACaja?: () => void;
  /** La de Caja (`cashTolerance`). Sin ella, sólo el céntimo decide. */
  tolerancia?: number;
}) {
  const [filtro, setFiltro] = useState<FiltroCuadre>("todos");
  const [visibles, setVisibles] = useState(PAGINA);
  const [busca, setBusca] = useState("");

  const cuenta = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, audits.filter(f.pasa).length])) as Record<FiltroCuadre, number>, [audits]);
  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const pasa = FILTROS.find((f) => f.id === filtro)!.pasa;
    return audits.filter((a) => pasa(a) && (!q || [a.fecha, a.turno, a.cajero, a.cerro, a.notes].some((t) => (t ?? "").toLowerCase().includes(q))));
  }, [audits, filtro, busca]);

  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
        <Calculator className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Todavía no hay cuadres: aparecen al cerrar una caja.</p>
        {onIrACaja && (
          <button type="button" onClick={onIrACaja} className="mt-3 inline-flex min-h-12 items-center rounded-xl px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ir a Caja › Hoy →
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] p-3">
        <div role="group" aria-label="Filtrar cuadres" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => { setFiltro(f.id); setVisibles(PAGINA); }}
            /* Filtro a 48 px (decisión de Brandon 09-10), con el patrón de chips de Pedidos. */
            className={button({
              variant: "secondary",
              className: cn("rounded-xl px-4", filtro === f.id && "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"),
            })}
          >
            {f.label} <span className="tabular-nums opacity-80">{cuenta[f.id]}</span>
          </button>
        ))}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setVisibles(PAGINA); }}
            placeholder="Buscar fecha, cajero o nota…"
            aria-label="Buscar en los cuadres"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
        </label>
      </div>

      {filas.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-secondary)]">{busca ? "Ningún cuadre con esa búsqueda." : "Ningún cuadre con ese filtro."}</p>
      ) : (
        <DataTable className="min-w-[640px]">
          <thead>
            <tr>
              <th>Fecha</th><th>Turno</th><th>Cajero/a</th>
              <th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th>
              <th>Estado</th><th><span className="sr-only">Ver</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, visibles).map((a) => {
              const s = STATUS_MAP[a.status];
              const SIcon = s.icon;
              const cerrada = a.status !== "pendiente";
              const conteo = a.conteos[0];
              const tolerada = dentroDeTolerancia(a, tolerancia);
              return (
                <tr key={a.id}>
                  <td className="font-bold text-[var(--text-primary)]">{a.fecha}<span className="block text-sm font-normal text-[var(--text-secondary)]">{horaLima(a.openedAt)}</span></td>
                  <td className="text-sm capitalize text-[var(--text-secondary)]">{a.turno}</td>
                  <td className="font-semibold text-[var(--text-primary)]">{a.cajero}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmt(a.expectedAmount)}</td>
                  <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {cerrada ? fmt(a.countedAmount) : conteo ? <span title={`Conteo express a las ${horaLima(conteo.creadoEn)}`}>{fmt(conteo.contado)}*</span> : "—"}
                  </td>
                  <td className={cn("text-right font-extrabold tabular-nums", !cerrada || a.difference === 0 ? "text-[var(--text-secondary)]" : tolerada || a.difference > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>
                    {cerrada ? fmtSigno(a.difference) : "—"}
                  </td>
                  <td>
                    {tolerada ? (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", STATUS_MAP.conforme.color)} title={`${s.label} de ${fmt(Math.abs(a.difference))}: hasta ±${fmt(tolerancia ?? 0)} se acepta`}>
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        <span>Dentro de tolerancia <span className="whitespace-nowrap font-normal text-[var(--text-secondary)]">(±{fmt(tolerancia ?? 0)})</span></span>
                      </span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", s.color)}><SIcon className="h-4 w-4" aria-hidden />{s.label}</span>
                    )}
                  </td>
                  <td>
                    <button type="button" aria-label={`Ver el cuadre del ${a.fecha}`} onClick={() => onVer(a)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
                      <Eye className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {filas.length > visibles && (
        <div className="border-t border-[var(--rule-soft)] p-2 text-center">
          <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className="min-h-12 rounded-xl px-4 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver {Math.min(PAGINA, filas.length - visibles)} más de {filas.length - visibles}
          </button>
        </div>
      )}
    </section>
  );
}
