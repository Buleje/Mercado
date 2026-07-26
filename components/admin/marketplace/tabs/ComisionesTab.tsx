"use client";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { useMarketplaceCommissions } from "@/components/admin/marketplace/hooks/use-marketplace-commissions";
import { TableSkeleton, COMMISSION_STATUS_CONFIG } from "@/components/admin/marketplace/shared";
import { AlertCircle, CheckCircle, Clock, DollarSign } from "@buleje/design-system/icons";

export function MarketplaceComisionesTab() {
  const {
    filtered, summary, loading, error,
    filterStatus, setFilterStatus,
    markingPaid, load,
    handleMarkPaid, handleBulkPay,
  } = useMarketplaceCommissions();

  if (loading) return <TableSkeleton />;

  // Total absoluto y % en cada estado para barras de proporción visual.
  const total = (summary.pendiente || 0) + (summary.liquidado || 0) + (summary.pagado || 0);
  const pct = (n: number) => (total > 0 ? Math.max(2, (n / total) * 100) : 0);

  // Counts por estado para los chips (para mostrar cuántos hay en cada filtro).
  const counts = {
    all: filtered.length || 0,
    pendiente: 0,
    liquidado: 0,
    pagado: 0,
  };
  // Dado que `filtered` ya respeta el filtro activo, contamos sobre ello cuando es "all"
  // y sobre `summary` (montos totales) como heurística; el dato exacto requeriría el hook
  // exponer `entries`. Los chips muestran montos (S/) más útiles que counts en este flow.

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* ── Hero card: total + barra de distribución ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-primary/5 via-white to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Comisiones marketplace</p>
            <CardTitle className="mt-1 text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight tabular-nums">
              S/ {total.toFixed(2)}
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Suma de todos los estados · {filtered.length} {filtered.length === 1 ? "comisión" : "comisiones"} listadas</p>
          </div>
          {summary.liquidado > 0 && (
            <button
              onClick={handleBulkPay}
              disabled={markingPaid === "bulk"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
            >
              <DollarSign className="h-4 w-4" />
              {markingPaid === "bulk" ? "Procesando..." : `Pagar liquidado · S/${summary.liquidado.toFixed(2)}`}
            </button>
          )}
        </div>

        {/* Barra de proporción visual (Pendiente / Liquidado / Pagado) */}
        <div className="relative">
          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--rule-soft)]">
            {total > 0 ? (
              <>
                <span className="bg-[var(--data-warning)]" style={{ width: `${pct(summary.pendiente)}%` }} />
                <span className="bg-primary" style={{ width: `${pct(summary.liquidado)}%` }} />
                <span className="bg-[var(--data-success)]" style={{ width: `${pct(summary.pagado)}%` }} />
              </>
            ) : null}
          </div>
        </div>

        {/* Detalle por estado */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { key: "pendiente", label: "Por pagar", value: summary.pendiente, dot: "bg-[var(--data-warning)]", icon: Clock },
            { key: "liquidado", label: "Liquidado", value: summary.liquidado, dot: "bg-primary", icon: CheckCircle },
            { key: "pagado", label: "Pagado", value: summary.pagado, dot: "bg-[var(--data-success)]", icon: CheckCircle },
          ].map(({ key, label, value, dot, icon: Icon }) => (
            <div key={key} className="flex items-start gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dot)} />
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
                <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tabular-nums">S/ {(value || 0).toFixed(2)}</p>
              </div>
              <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)] ml-auto mt-1 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Filtros como chips grandes con monto ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: "all", label: "Todas", amount: total },
          { value: "pendiente", label: "Por pagar", amount: summary.pendiente },
          { value: "liquidado", label: "Liquidado", amount: summary.liquidado },
          { value: "pagado", label: "Pagado", amount: summary.pagado },
        ].map((f) => {
          const active = filterStatus === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 text-sm font-bold transition-all tabular-nums",
                active
                  ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              )}
            >
              {f.label}
              <span className={cn("text-xs font-semibold tabular-nums", active ? "text-primary/80" : "text-[var(--text-tertiary)]")}>
                S/{(f.amount || 0).toFixed(0)}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && !error ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-4">
            <DollarSign className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            {filterStatus !== "all" ? `Sin comisiones en "${filterStatus}"` : "Sin comisiones registradas aún"}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {filterStatus !== "all"
              ? "Probá con otro filtro o vé al estado anterior del flujo."
              : "Cuando recibas pedidos por marketplace, las comisiones aparecerán acá."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Orden</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Comisión</th>
                  <th className="text-center px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Estado</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Fecha</th>
                  <th className="text-center px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-[var(--surface-sunken)] transition-colors">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-xs font-bold text-[var(--text-primary)] bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-md px-2 py-1">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-[var(--text-secondary)] tabular-nums">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-sm font-extrabold text-[var(--text-primary)] tabular-nums">S/{e.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {e.status !== "pagado" ? (
                          <button
                            onClick={() => handleMarkPaid(e.id)}
                            disabled={markingPaid === e.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                          >
                            {markingPaid === e.id ? (
                              <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            {markingPaid === e.id ? "..." : "Marcar pagado"}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            <CheckCircle className="h-3 w-3" /> Pagado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Cupones
// ─────────────────────────────────────────────
