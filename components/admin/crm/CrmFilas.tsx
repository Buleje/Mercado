"use client";

import BotonIconoTip from "@/components/admin/shared/boton-icono-tip";
import { Phone, ShoppingCart, Plus } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { fmt, fmtRelative, SEGMENT_CONFIG } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";

/** Filas de la tabla de clientes. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmFilas({ crm }: { crm: Crm }) {
  const {
    setDetail, editingCreditLimit, setEditingCreditLimit, creditLimitInput, setCreditLimitInput,
    creditLimitInputRef, compareMode, comparePhones, orden, rankingMap, getFreqLabel, paginated,
    saveCreditLimit, toggleCompare,
  } = crm;
  return (
    <>
      {paginated.map(c => {
        const seg = c._segment ?? "nuevo";
        const cfg = SEGMENT_CONFIG[seg];
        const Icon = cfg.Icon;
        return (
          <m.tr
            key={c.phone}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn("hover:bg-[var(--surface-alt)] dark:hover:bg-surface/50 transition-colors", compareMode && comparePhones.has(c.phone) && "bg-[var(--surface-sunken)]")}
          >
            {/* Mejora 13: Checkbox para comparar */}
            {compareMode && (
              <td onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${c.name || c.phone} para comparar`}
                  checked={comparePhones.has(c.phone)}
                  onChange={() => toggleCompare(c.phone)}
                  disabled={!comparePhones.has(c.phone) && comparePhones.size >= 3}
                  className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--text-secondary)] focus:ring-[var(--rule-base)]"
                />
              </td>
            )}
            <EnOrden
              orden={orden.orden}
              celdas={{
                rank: (
                  <td className="text-center">
                    {(() => {
                      const rank = rankingMap.get(c.phone) ?? 999;
                      if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-xs font-extrabold">1</span>;
                      if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--surface-sunken)] text-[var(--text-primary)] text-xs font-extrabold">2</span>;
                      if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-xs font-extrabold">3</span>;
                      if (rank <= 10) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted text-xs font-bold">#{rank}</span>;
                      return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">—</span>;
                    })()}
                  </td>
                ),
                cliente: (
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0 select-none">
                        {c.name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("")}
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</p>
                        {c.location && <p className="text-xs text-[var(--text-tertiary)] truncate max-w-[120px]">{c.location}</p>}
                        {/* Mejora 12: Resumen compacto del cliente */}
                        <p className="hidden sm:block text-xs text-[var(--text-tertiary)] dark:text-muted truncate max-w-[220px]">
                          {c._orderCount ?? 0} compras · S/{((c.totalSpent ?? 0)).toFixed(0)} · {getFreqLabel(c).label} · {c._lastOrder ? fmtRelative(c._lastOrder) : "sin compras"}
                        </p>
                      </div>
                    </div>
                  </td>
                ),
                telefono: (
                  <td>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] dark:text-muted">
                      <Phone className="h-3 w-3" />{c.phone}
                    </span>
                  </td>
                ),
                ultimoPedido: (
                  <td className="text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">
                    {c._lastOrder ? fmtRelative(c._lastOrder) : "—"}
                  </td>
                ),
                totalGastado: (
                  <td className="text-right font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] hidden md:table-cell">
                    {fmt(c.totalSpent ?? 0)}
                  </td>
                ),
                credito: (
                  <td className="hidden lg:table-cell">
                    {editingCreditLimit === c.phone ? (
                      <form
                        onSubmit={e => { e.preventDefault(); saveCreditLimit(c.phone); }}
                        className="flex items-center gap-1"
                      >
                        <input
                          ref={creditLimitInputRef}
                          type="number"
                          min={0}
                          step={0.01}
                          value={creditLimitInput}
                          onChange={e => setCreditLimitInput(e.target.value)}
                          className="w-20 text-xs border border-primary/40 rounded-xl px-2 py-1 bg-[var(--surface-raised)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="0.00"
                        />
                        <button type="submit" className="text-xs px-1.5 py-1 bg-primary text-white rounded-lg font-bold">OK</button>
                        <button type="button" onClick={() => setEditingCreditLimit(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">×</button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditingCreditLimit(c.phone); setCreditLimitInput(String(c.creditLimit ?? 0)); }}
                        className="group text-left"
                        title={c.creditLimit != null && c.creditLimit > 0 ? "Click para editar límite de crédito" : "Añadir límite de crédito"}
                      >
                        {c.creditLimit != null && c.creditLimit > 0 ? (
                          <StatusBadge
                            variant={(c.creditBalance ?? 0) >= c.creditLimit ? "error" : "success"}
                            label={(c.creditBalance ?? 0) >= c.creditLimit ? "LÍMITE ALCANZADO" : `${fmt(c.creditBalance ?? 0)} / ${fmt(c.creditLimit)}`}
                            size="sm"
                          />
                        ) : (
                          <span aria-label="Añadir límite de crédito" role="img" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Plus className="h-4 w-4" aria-hidden /></span>
                        )}
                      </button>
                    )}
                  </td>
                ),
                segmento: (
                  <td>
                    <StatusBadge variant={cfg.variant} label={cfg.label} icon={Icon} size="sm" />
                  </td>
                ),
                contacto: (
                  <td className="hidden md:table-cell">
                    {(() => {
                      const lastContact = c._lastOrder;
                      if (!lastContact) return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">—</span>;
                      const days = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
                      let label: string;
                      let colorClass: string;
                      if (days === 0) { label = "Hoy"; colorClass = "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"; }
                      else if (days === 1) { label = "Ayer"; colorClass = "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"; }
                      else if (days < 7) { label = `Hace ${days}d`; colorClass = "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"; }
                      else if (days < 14) { label = "Hace 1 sem"; colorClass = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"; }
                      else if (days < 30) { label = `Hace ${Math.floor(days / 7)} sem`; colorClass = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"; }
                      else if (days < 90) { label = `Hace ${Math.floor(days / 30)} meses`; colorClass = "text-[var(--data-error-600)] dark:text-red-400"; }
                      else { label = "Inactivo"; colorClass = "text-[var(--text-tertiary)] dark:text-muted"; }
                      return <span className={cn("text-xs font-bold", colorClass)}>{label}</span>;
                    })()}
                  </td>
                ),
              }}
            />

            {/* Acciones */}
            <td className="text-center">
              <BotonIconoTip
                icon={ShoppingCart}
                tono="acento"
                tamano="sm"
                onClick={() => setDetail(c.phone)}
                label={`Ver la ficha 360° de ${c.name}`}
                tip="Ficha 360°"
              />
            </td>
          </m.tr>
        );
      })}
    </>
  );
}
