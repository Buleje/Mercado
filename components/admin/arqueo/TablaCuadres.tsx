"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Calculator, Eye } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { FILTROS, STATUS_MAP, fmt, fmtSigno, horaLima, type CashAudit, type FiltroCuadre } from "./arqueo-shared";

const PAGINA = 20;

/**
 * Historial de cuadres con sus filtros pegados. `GET /api/cash-registers`
 * devuelve TODAS las cajas: con un año de cierres diarios la tabla pasaba de
 * 300 filas, así que se muestran de a 20 («Ver más»).
 */
export default function TablaCuadres({ audits, onVer, onIrACaja }: { audits: CashAudit[]; onVer: (a: CashAudit) => void; onIrACaja?: () => void }) {
  const [filtro, setFiltro] = useState<FiltroCuadre>("todos");
  const [visibles, setVisibles] = useState(PAGINA);

  const cuenta = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, audits.filter(f.pasa).length])) as Record<FiltroCuadre, number>, [audits]);
  const filas = useMemo(() => audits.filter(FILTROS.find((f) => f.id === filtro)!.pasa), [audits, filtro]);

  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
        <Calculator className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Todavía no hay cuadres: aparecen al cerrar una caja.</p>
        {onIrACaja && (
          <button type="button" onClick={onIrACaja} className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ir a Caja registradora →
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div role="group" aria-label="Filtrar cuadres" className="flex flex-wrap gap-1.5 border-b border-[var(--rule-soft)] px-3 py-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => { setFiltro(f.id); setVisibles(PAGINA); }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors",
              filtro === f.id ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {f.label} <span className="tabular-nums opacity-80">{cuenta[f.id]}</span>
          </button>
        ))}
      </div>

      {filas.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Ningún cuadre con ese filtro.</p>
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
              return (
                <tr key={a.id}>
                  <td className="font-bold text-[var(--text-primary)]">{a.fecha}<span className="block text-xs font-normal text-[var(--text-secondary)]">{horaLima(a.openedAt)}</span></td>
                  <td className="text-xs capitalize text-[var(--text-secondary)]">{a.turno}</td>
                  <td className="font-semibold text-[var(--text-primary)]">{a.cajero}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmt(a.expectedAmount)}</td>
                  <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {cerrada ? fmt(a.countedAmount) : conteo ? <span title={`Conteo express a las ${horaLima(conteo.creadoEn)}`}>{fmt(conteo.contado)}*</span> : "—"}
                  </td>
                  <td className={cn("text-right font-extrabold tabular-nums", !cerrada || a.difference === 0 ? "text-[var(--text-secondary)]" : a.difference > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>
                    {cerrada ? fmtSigno(a.difference) : "—"}
                  </td>
                  <td><span className={cn("inline-flex items-center gap-1 text-xs font-bold", s.color)}><SIcon className="h-4 w-4" aria-hidden />{s.label}</span></td>
                  <td>
                    <button type="button" aria-label={`Ver el cuadre del ${a.fecha}`} onClick={() => onVer(a)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
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
          <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className="min-h-10 px-4 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver {Math.min(PAGINA, filas.length - visibles)} más de {filas.length - visibles}
          </button>
        </div>
      )}
    </section>
  );
}
