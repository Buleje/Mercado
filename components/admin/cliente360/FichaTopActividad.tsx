"use client";

import { CardTitle } from "@buleje/design-system";
import { Clock, Heart, Bell } from "@buleje/design-system/icons";
import { fmtRelative, TIMELINE_ICON, type Resumen360 } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Top productos por pedidos y actividad reciente. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaTopActividad({ ficha, resumen }: { ficha: Cliente360; resumen: Resumen360 }) {
  const {
    timeline,
  } = ficha;
  const { topProducts } = resumen;
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Productos favoritos (local, basado en pedidos cargados) */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-[var(--text-secondary)]" /> Top productos (pedidos)
          </CardTitle>
          {topProducts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin compras registradas</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-[var(--text-tertiary)] w-4 text-right">{i + 1}</span>
                  <div className="flex-1 bg-[var(--surface-sunken)] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-primary/20 dark:bg-primary/30 rounded-full transition-all"
                      style={{ width: `${Math.min((p.count / (topProducts[0]?.count ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[120px]">{p.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0">x{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Actividad reciente
          </CardTitle>
          {timeline.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin actividad registrada</p>
          ) : (
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              {timeline.slice(0, 12).map((ev) => {
                const Icon = TIMELINE_ICON[ev.icon] ?? Bell;
                return (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{ev.title}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{ev.detail}</p>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">{fmtRelative(ev.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
