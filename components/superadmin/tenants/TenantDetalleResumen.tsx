"use client";

import type { ReactNode } from "react";
import { Loader2, Copy, Lock, Clock, ShoppingBag, Globe, Mail, CreditCard, Timer, ArrowRight } from "@buleje/design-system/icons";
import { CardTitle, StatCard } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import type { TenantRow } from "@/lib/superadmin-types";
import { PlanBadge } from "@/components/superadmin/_shared";
import { ChipEstado } from "@/components/superadmin/tenants/TenantDetalleChip";
import { diasHasta, fmtDia, fmtMoney } from "@/components/superadmin/tenants/tenant-detalle-shared";
import type { TenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";

/** Una fila de «Estado de la cuenta»: etiqueta a la izquierda (arriba a 400 px), valor y acción a la derecha. */
function Fila({ icon: Icon, etiqueta, children }: { icon: typeof Clock; etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="flex shrink-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" /> {etiqueta}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{children}</dd>
    </div>
  );
}

function textoPrueba(iso: string | null): string {
  const dias = diasHasta(iso);
  if (dias === null) return "Sin prueba";
  if (dias > 1) return `${fmtDia(iso)} · quedan ${dias} días`;
  if (dias === 1) return `${fmtDia(iso)} · queda 1 día`;
  if (dias === 0) return `${fmtDia(iso)} · vence hoy`;
  return `${fmtDia(iso)} · venció hace ${-dias} ${dias === -1 ? "día" : "días"}`;
}

/** Resumen de `t.avisosCorreo` en una frase + su tono. */
function resumenAvisos(t: TenantRow): { texto: string; tono: "ok" | "alerta" | "neutro" } | null {
  const a = t.avisosCorreo;
  if (!a) return null;
  if (!a.correo?.trim()) return { texto: "Sin correo: no salen", tono: "alerta" };
  if (a.pausado) return { texto: "Pausados", tono: "alerta" };
  return { texto: `${a.activos} de ${a.total} activos`, tono: a.activos > 0 ? "ok" : "neutro" };
}

/** Pestaña «Resumen» de la ficha rápida: cifras del mes, estado de la cuenta y acceso. */
export function TenantDetalleResumen({ t, d }: { t: TenantRow; d: TenantDetalle }) {
  const { storeInfo, trialBusy, handleExtendTrial, handleCopyInfo, credCopied, setTab } = d;
  const ganancia = t.monthProfit ?? 0;
  const avisos = resumenAvisos(t);
  const diasPrueba = diasHasta(t.trialEndsAt);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <CardTitle>Este mes</CardTitle>
        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-3 @min-[52rem]:grid-cols-6 sm:gap-3">
            <StatCard density="compact" label="Ventas" value={fmtMoney(t.monthRevenue ?? 0)} />
            <StatCard density="compact" label="Gastos" value={fmtMoney(t.monthExpenses ?? 0)} />
            <StatCard density="compact" label="Ganancia" value={fmtMoney(ganancia)} emphasis={ganancia < 0 ? "error" : "neutral"} highlight />
            <StatCard density="compact" label="Pedidos" value={(t.monthOrders ?? t.usage?.ordersThisMonth ?? 0).toLocaleString("es-PE")} />
            <StatCard density="compact" label="Usuarios" value={t._count.AdminUser.toLocaleString("es-PE")} />
            <StatCard density="compact" label="Productos" value={(t.usage?.products ?? 0).toLocaleString("es-PE")} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <CardTitle>Estado de la cuenta</CardTitle>
        <dl className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:divide-[var(--rule-base)]">
          <Fila icon={CreditCard} etiqueta="Plan">
            <PlanBadge plan={t.plan} />
            {t.cancelAtPeriodEnd && <ChipEstado tono="alerta">Cancela al cierre del periodo</ChipEstado>}
          </Fila>
          <Fila icon={Timer} etiqueta="Prueba">
            <span className={`text-sm font-semibold ${diasPrueba !== null && diasPrueba <= 3 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]"}`}>
              {textoPrueba(t.trialEndsAt)}
            </span>
            <span className="flex gap-1.5" role="group" aria-label="Extender la prueba">
              {[7, 14, 30].map((dias) => (
                <button
                  key={dias}
                  type="button"
                  onClick={() => void handleExtendTrial(dias)}
                  disabled={trialBusy}
                  title={`Extender la prueba ${dias} días`}
                  className={button({ variant: "secondary", size: "md", className: "px-3.5" })}
                >
                  {trialBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}+{dias}d
                </button>
              ))}
            </span>
          </Fila>
          <Fila icon={ShoppingBag} etiqueta="Marketplace">
            {storeInfo ? (
              <>
                <ChipEstado tono={storeInfo.isPublished ? "ok" : "neutro"}>{storeInfo.isPublished ? "Publicada" : "No publicada"}</ChipEstado>
                <span className="text-xs text-[var(--text-secondary)]">{storeInfo._count.products.toLocaleString("es-PE")} productos</span>
              </>
            ) : (
              <span className="text-sm text-[var(--text-secondary)]">Sin tienda en el marketplace</span>
            )}
          </Fila>
          <Fila icon={Mail} etiqueta="Avisos por correo">
            {avisos && <ChipEstado tono={avisos.tono}>{avisos.texto}</ChipEstado>}
            {t.avisosCorreo?.esGmail && <ChipEstado tono="acento">Gmail</ChipEstado>}
            <button type="button" onClick={() => setTab("avisos")} className={button({ variant: "ghost", size: "md", className: "px-3" })}>
              Ver avisos <ArrowRight className="h-4 w-4" />
            </button>
          </Fila>
          {t.customDomain && (
            <Fila icon={Globe} etiqueta="Dominio propio">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{t.customDomain}</span>
            </Fila>
          )}
        </dl>
      </section>

      <section className="space-y-3">
        <CardTitle>Acceso</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={handleCopyInfo} className={button({ variant: "secondary" })}>
            <Copy className="h-4 w-4" /> {credCopied ? "¡Copiado!" : "Copiar info"}
          </button>
          <button type="button" onClick={() => setTab("credenciales")} className={button({ variant: "secondary" })}>
            <Lock className="h-4 w-4" /> Usuarios y contraseñas
          </button>
        </div>
      </section>
    </div>
  );
}
