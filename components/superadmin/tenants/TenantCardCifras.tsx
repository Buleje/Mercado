"use client";

import { CheckCircle2, Package, Users, Store, AlertTriangle } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { StatCard } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DatosDeTarjeta } from "@/components/superadmin/tenants/tenant-card-datos";
import type { TenantCardProps } from "@/components/superadmin/tenants/TenantCard";

interface TenantCardCifrasProps {
  t: TenantRow;
  datos: DatosDeTarjeta;
  onViewProducts?: TenantCardProps["onViewProducts"];
}

/** Cifras del mes, recursos, estado del panel y uso del plan de una tienda. */
export function TenantCardCifras({ t, datos, onViewProducts }: TenantCardCifrasProps) {
  const { health, totalUsagePct, fmtMoney, storeInfo, revenue, expenses, profit, hasVisibleAdminData } = datos;
  return (
    <>
        {/* Financial KPIs — Brandon 2026-05-21:
            · mobile: 2x2 con gap-2
            · desktop high-impact: gap-3 (más respiro entre cards angostas
              cuando hay grid de 3 col en el page → los valores "S/144 S/0"
              se veían pegados). */}
        {/* 2026-10-08: 4 columnas solo si la tarjeta es ancha (container query); a 1280 con 3 tarjetas por fila «Ganancia» salía cortado. */}
        <div className="@container">
          <div className="grid grid-cols-2 @min-[26rem]:grid-cols-4 gap-2 sm:gap-3">
            <StatCard density="compact" label="Ventas" value={fmtMoney(revenue)} />
            <StatCard density="compact" label="Gastos" value={fmtMoney(expenses)} />
            <StatCard density="compact" label="Ganancia" value={fmtMoney(profit)} />
            <StatCard density="compact" label="Pedidos" value={String(t.monthOrders ?? 0)} />
          </div>
        </div>

        {/* Resources — chips neutros uniformes (3 cols ya cabe en mobile
            con gap-1.5, los labels usan text-xs centered). */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {[
            {
              val: t.usage?.products ?? 0,
              lbl: "Productos",
              icon: Package,
              max: t.limits?.maxProducts ?? -1,
              clickable: true,
            },
            {
              val: t._count.AdminUser,
              lbl: "Usuarios",
              icon: Users,
              max: t.limits?.maxUsers ?? -1,
              clickable: false,
            },
            {
              val: storeInfo?._count.products ?? 0,
              lbl: "En Marketplace",
              icon: Store,
              max: -1,
              clickable: false,
            },
          ].map(({ val, lbl, icon: Icon, max, clickable }) => {
            const usagePct = max === -1 ? 0 : Math.min(100, Math.round((val / max) * 100));
            const isEmpty = val === 0 && lbl !== "Usuarios";
            const canClick = clickable && Boolean(onViewProducts);
            return (
              <div
                key={lbl}
                onClick={canClick ? () => onViewProducts?.(t) : undefined}
                onKeyDown={
                  canClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onViewProducts?.(t);
                        }
                      }
                    : undefined
                }
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                className={`rounded-lg p-2.5 text-center bg-[var(--surface-sunken)] border border-[var(--rule-soft)] ${
                  canClick
                    ? "cursor-pointer hover:border-[var(--rule-strong)] transition-colors"
                    : ""
                }`}
              >
                <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-[var(--text-secondary)]" />
                <div
                  className={`text-base font-bold ${isEmpty ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}
                >
                  {val}
                </div>
                <div className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {canClick ? (isEmpty ? "Sin datos ▸" : `${lbl} ▸`) : isEmpty ? "Sin datos" : lbl}
                </div>
                {max !== -1 && !isEmpty && (
                  <div className="h-1 bg-[var(--rule-soft)] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usagePct}%`,
                        background:
                          usagePct >= 100
                            ? "var(--data-error)"
                            : usagePct >= 80
                              ? "var(--data-warning-500)"
                              : "var(--accent)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel data status — DS Alert. Admin tenants: mensaje neutral, no warning. */}
        {(() => {
          const ok = hasVisibleAdminData || health.isAdmin;
          const [titulo, detalle] = hasVisibleAdminData
            ? ["Panel con información", "Esta tienda ya muestra datos en su panel."]
            : health.isAdmin
              ? ["Negocio interno", "Cuenta interna del owner. No requiere productos ni movimientos."]
              : ["Panel sin información", "Faltan productos o movimientos. Revisa la carga inicial de la tienda."];
          return (
            <div
              role="status"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${ok ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"}`}
            >
              {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{titulo}</span>
              <InfoTip title={titulo} what={detalle} />
            </div>
          );
        })()}

        {/* Plan usage bar */}
        {t.usage && t.limits && (
          <div className="space-y-1">
            <div className="flex justify-between text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              <span>Uso del plan</span>
              <span
                className={
                  totalUsagePct >= 100
                    ? "text-[var(--data-error-500)]"
                    : totalUsagePct >= 80
                      ? "text-teal-500"
                      : "text-[var(--text-secondary)]"
                }
              >
                {totalUsagePct}%
              </span>
            </div>
            <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${totalUsagePct}%`,
                  background:
                    totalUsagePct >= 100
                      ? "var(--data-error)"
                      : totalUsagePct >= 80
                        ? "var(--data-warning-500)"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>
        )}
    </>
  );
}
