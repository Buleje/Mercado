"use client";

import StatusBadge from "@/components/admin/shared/StatusBadge";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import {
  fmt, fmtRelative, frecuenciaDe, FRECUENCIAS, SEGMENT_CONFIG, tonoDeUltimaCompra,
} from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import CrmAccionesCliente from "@/components/admin/crm/CrmAccionesCliente";

/** Filas de la tabla de clientes. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmFilas({ crm }: { crm: Crm }) {
  const {
    setDetail, editingCreditLimit, setEditingCreditLimit, creditLimitInput, setCreditLimitInput,
    creditLimitInputRef, compareMode, comparePhones, orden, paginated, saveCreditLimit, toggleCompare,
  } = crm;
  return (
    <>
      {paginated.map(c => {
        const cfg = SEGMENT_CONFIG[c._segment ?? "nuevo"];
        const frec = frecuenciaDe(c);
        const compras = c._orderCount ?? 0;
        return (
          <m.tr
            key={c.phone}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn("hover:bg-[var(--surface-alt)] dark:hover:bg-surface/50 transition-colors", compareMode && comparePhones.has(c.phone) && "bg-[var(--surface-sunken)]")}
          >
            {compareMode && (
              <td>
                <input
                  type="checkbox"
                  aria-label={`Comparar a ${c.name || c.phone}`}
                  checked={comparePhones.has(c.phone)}
                  onChange={() => toggleCompare(c.phone)}
                  disabled={!comparePhones.has(c.phone) && comparePhones.size >= 3}
                  className="h-5 w-5 rounded border-[var(--rule-base)] accent-[var(--accent)]"
                />
              </td>
            )}
            <EnOrden
              orden={orden.orden}
              celdas={{
                cliente: (
                  <td>
                    {/* El nombre abre la ficha: antes sólo un carrito de 32 px al final de la fila. */}
                    <button
                      type="button"
                      onClick={() => setDetail(c.phone)}
                      className="group flex min-h-12 min-w-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <span aria-hidden className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg bg-primary/10 text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        {c.name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("")}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-[var(--text-primary)] group-hover:underline">{c.name}</span>
                        {c.location && <span className="block max-w-[14rem] truncate text-sm text-[var(--text-secondary)]">{c.location}</span>}
                      </span>
                    </button>
                  </td>
                ),
                telefono: (
                  <td className="tabular-nums text-[var(--text-secondary)]">{c.phone}</td>
                ),
                ultimaCompra: (
                  <td>
                    <div className="min-w-0">
                      <span className={cn("block text-sm font-semibold", tonoDeUltimaCompra(c._lastOrder))}>
                        {c._lastOrder ? fmtRelative(c._lastOrder) : "Sin compras"}
                      </span>
                      {/* La frecuencia de los últimos 30 días sólo si compró: «Sin compras en 30 días» ya lo dice la fecha. */}
                      {frec !== "sin-compras" && (
                        <span className="block text-sm text-[var(--text-secondary)]">
                          {FRECUENCIAS.find(f => f.id === frec)?.label} · {c._compras30d} en 30 días
                        </span>
                      )}
                    </div>
                  </td>
                ),
                totalGastado: (
                  <td className="text-right">
                    <div className="min-w-0">
                      <span className="block font-bold tabular-nums text-[var(--text-primary)]">{fmt(c.totalSpent ?? 0)}</span>
                      <span className="block text-sm tabular-nums text-[var(--text-secondary)]">
                        {compras === 1 ? "1 compra" : `${compras} compras`}
                      </span>
                    </div>
                  </td>
                ),
                credito: (
                  <td>
                    {editingCreditLimit === c.phone ? (
                      <form onSubmit={e => { e.preventDefault(); saveCreditLimit(c.phone); }} className="flex items-center gap-1">
                        <input
                          ref={creditLimitInputRef}
                          type="number"
                          min={0}
                          step={0.01}
                          value={creditLimitInput}
                          onChange={e => setCreditLimitInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Escape") setEditingCreditLimit(null); }}
                          aria-label={`Límite de crédito de ${c.name}`}
                          className="h-12 w-24 rounded-xl border border-primary/40 bg-[var(--surface-raised)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="0.00"
                        />
                        <button type="submit" className="h-12 rounded-xl bg-primary px-3 text-sm font-bold text-white">Guardar</button>
                      </form>
                    ) : c.creditLimit != null && c.creditLimit > 0 ? (
                      <StatusBadge
                        variant={(c.creditBalance ?? 0) >= c.creditLimit ? "error" : "success"}
                        label={(c.creditBalance ?? 0) >= c.creditLimit ? "Límite alcanzado" : `${fmt(c.creditBalance ?? 0)} / ${fmt(c.creditLimit)}`}
                        size="sm"
                      />
                    ) : (c.creditBalance ?? 0) > 0 ? (
                      <span className="text-sm font-semibold text-[var(--data-warning-ink)]">Debe {fmt(c.creditBalance ?? 0)}</span>
                    ) : (
                      <span className="text-sm text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                ),
                segmento: (
                  <td>
                    <StatusBadge variant={cfg.variant} label={cfg.label} icon={cfg.Icon} size="sm" />
                  </td>
                ),
              }}
            />
            <td className="text-right">
              <CrmAccionesCliente
                c={c}
                onFicha={() => setDetail(c.phone)}
                onLimite={() => { setEditingCreditLimit(c.phone); setCreditLimitInput(String(c.creditLimit ?? 0)); }}
                comparando={compareMode ? { marcado: comparePhones.has(c.phone), lleno: comparePhones.size >= 3, alternar: () => toggleCompare(c.phone) } : null}
              />
            </td>
          </m.tr>
        );
      })}
    </>
  );
}
