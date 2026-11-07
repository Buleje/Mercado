"use client";

import { Casilla } from "@/components/ui-system/Casilla";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { fmt, fmtRelative, SEGMENT_CONFIG, tonoDeUltimaCompra } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import CrmAccionesCliente from "@/components/admin/crm/CrmAccionesCliente";

/**
 * Los clientes en el celular (≤639 px): una tarjeta de ~110 px por cliente en vez
 * de la fila-tarjeta de la tabla (6 rótulos apilados, ~360 px). Mismos datos y
 * mismas acciones que `CrmFilas`; la tabla sigue en pantallas más anchas.
 */
export default function CrmTarjetas({ crm }: { crm: Crm }) {
  const {
    setDetail, editingCreditLimit, setEditingCreditLimit, creditLimitInput, setCreditLimitInput,
    creditLimitInputRef, compareMode, comparePhones, paginated, saveCreditLimit, toggleCompare,
  } = crm;
  return (
    <ul className="divide-y divide-[var(--rule-soft)] sm:hidden">
      {paginated.map((c) => {
        const cfg = SEGMENT_CONFIG[c._segment ?? "nuevo"];
        const compras = c._orderCount ?? 0;
        const editando = editingCreditLimit === c.phone;
        return (
          <li key={c.phone} className={cn("space-y-1 px-3 py-2", compareMode && comparePhones.has(c.phone) && "bg-[var(--surface-sunken)]")}>
            <div className="flex items-center gap-2">
              {compareMode && (
                <Casilla
                  aria-label={`Comparar a ${c.name || c.phone}`}
                  checked={comparePhones.has(c.phone)}
                  onChange={() => toggleCompare(c.phone)}
                  disabled={!comparePhones.has(c.phone) && comparePhones.size >= 3}
                />
              )}
              <button type="button" onClick={() => setDetail(c.phone)} className="min-h-12 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                <span className="block truncate font-bold text-[var(--text-primary)]">{c.name}</span>
                <span className="block truncate text-sm tabular-nums text-[var(--text-secondary)]">{c.phone}{c.location ? ` · ${c.location}` : ""}</span>
              </button>
              <CrmAccionesCliente
                c={c}
                onFicha={() => setDetail(c.phone)}
                onLimite={() => { setEditingCreditLimit(c.phone); setCreditLimitInput(String(c.creditLimit ?? 0)); }}
                comparando={compareMode ? { marcado: comparePhones.has(c.phone), lleno: comparePhones.size >= 3, alternar: () => toggleCompare(c.phone) } : null}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-semibold", tonoDeUltimaCompra(c._lastOrder))}>{c._lastOrder ? fmtRelative(c._lastOrder) : "Sin compras"}</span>
              <span className="tabular-nums text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">{fmt(c.totalSpent ?? 0)}</b> · {compras === 1 ? "1 compra" : `${compras} compras`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge variant={cfg.variant} label={cfg.label} icon={cfg.Icon} size="sm" />
              {!editando && c.creditLimit != null && c.creditLimit > 0 && (
                <StatusBadge
                  variant={(c.creditBalance ?? 0) >= c.creditLimit ? "error" : "success"}
                  label={(c.creditBalance ?? 0) >= c.creditLimit ? "Límite alcanzado" : `${fmt(c.creditBalance ?? 0)} / ${fmt(c.creditLimit)}`}
                  size="sm"
                />
              )}
              {!editando && !(c.creditLimit != null && c.creditLimit > 0) && (c.creditBalance ?? 0) > 0 && (
                <span className="font-semibold text-[var(--data-warning-ink)]">Debe {fmt(c.creditBalance ?? 0)}</span>
              )}
              {!editando && (c.saldoAFavor ?? 0) > 0 && (
                <span className="font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">A favor {fmt(c.saldoAFavor ?? 0)}</span>
              )}
            </div>
            {editando && (
              <form onSubmit={(e) => { e.preventDefault(); saveCreditLimit(c.phone); }} className="flex items-center gap-1">
                <input
                  ref={creditLimitInputRef}
                  type="number"
                  min={0}
                  step={0.01}
                  value={creditLimitInput}
                  onChange={(e) => setCreditLimitInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingCreditLimit(null); }}
                  aria-label={`Límite de crédito de ${c.name}`}
                  className="h-12 w-28 rounded-xl border border-primary/40 bg-[var(--surface-raised)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="0.00"
                />
                <button type="submit" className="h-12 rounded-xl bg-primary px-3 text-sm font-bold text-white">Guardar</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
