"use client";

import { CardTitle } from "@buleje/design-system";
import { Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { fmtDate } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Historial de puntos de lealtad. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaPuntos({ ficha }: { ficha: Cliente360 }) {
  const {
    orders,
  } = ficha;
  return (
    <>
      {/* Mejora 16: Historial de Puntos de Lealtad */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Star className="h-4 w-4 text-[var(--data-warning-500)]" /> Historial de Puntos
        </CardTitle>
        {(() => {
          // Calcular puntos desde ordenes del cliente
          const TASA_PUNTOS = 0.5; // 0.5 puntos por cada sol gastado
          const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const pointsHistory = sortedOrders.slice(0, 20).map(o => ({
            id: o.id,
            type: "earn" as const,
            points: Math.round(o.total * TASA_PUNTOS),
            description: `Compra S/${Number(o.total).toFixed(0)}`,
            date: o.createdAt,
          }));
          const totalPoints = pointsHistory.reduce((s, p) => s + p.points, 0);

          if (pointsHistory.length === 0) {
            return <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-2">El cliente no tiene movimientos de puntos</p>;
          }

          return (
            <div className="space-y-3">
              {/* Saldo actual */}
              <div className="flex items-center gap-3 p-3 bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-xl">
                <Star className="h-6 w-6 text-[var(--data-warning-500)]" />
                <div>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{totalPoints} puntos</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">= {formatCurrency(totalPoints * 0.05)} en descuento</p>
                </div>
                {totalPoints >= 100 && (
                  <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                    Canjeable
                  </span>
                )}
              </div>
              {/* Timeline */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {pointsHistory.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "shrink-0 font-bold",
                      entry.type === "earn" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                    )}>
                      {entry.type === "earn" ? "+" : "-"}{entry.points} pts
                    </span>
                    <span className="text-[var(--text-secondary)] truncate flex-1">
                      {entry.description}
                    </span>
                    <span className="text-[var(--text-tertiary)] dark:text-muted shrink-0 text-xs">
                      {fmtDate(entry.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
