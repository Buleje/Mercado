"use client";

import { logger } from "@/lib/logger";
import { ShoppingBag, Bell } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { ProductBadge } from "@buleje/design-system";
import type { DatosDeTarjeta } from "@/components/superadmin/tenants/tenant-card-datos";
import type { TenantCardProps } from "@/components/superadmin/tenants/TenantCard";

interface TenantCardSenalesProps {
  t: TenantRow;
  datos: DatosDeTarjeta;
  healthProp?: TenantCardProps["health"];
  setPendingModalOpen: (abierto: boolean) => void;
}

/** Cabecera de la tarjeta: plan + salud, identidad y fila de señales (pendientes, prueba, marketplace). */
export function TenantCardSenales({ t, datos, healthProp, setPendingModalOpen }: TenantCardSenalesProps) {
  const { initials, health, pendingCount, isOnMarketplace, planLabel, trialBadge, trialEnds } = datos;
  return (
    <>
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 whitespace-nowrap text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)] font-semibold">
            Plan {planLabel}
          </span>
          {healthProp && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ring-1 ${
                healthProp === "healthy"
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] ring-[var(--data-success-500)]/30"
                  : healthProp === "warning"
                    ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/30"
                    : "bg-rose-500/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] ring-rose-500/30"
              }`}
              title={
                healthProp === "healthy"
                  ? "Tenant saludable — activo, sin pendientes excesivos"
                  : healthProp === "warning"
                    ? "Atención — alguna métrica está baja"
                    : "Crítico — suspendido o múltiples problemas"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  healthProp === "healthy"
                    ? "bg-[var(--data-success-500)] animate-pulse"
                    : healthProp === "warning"
                      ? "bg-teal-500"
                      : "bg-rose-500"
                }`}
                aria-hidden
              />
              {healthProp === "healthy" ? "OK" : healthProp === "warning" ? "Aviso" : "Crítico"}
            </span>
          )}
        </div>

        {/* Avatar + Name + Status */}
        <div className="flex items-start gap-3">
          {t.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de tenant es URL externa o blob, no se puede usar next/image sin remotePatterns por host
            <img
              src={t.logoUrl}
              alt={`Logo ${t.name}`}
              className="w-12 h-12 rounded-lg object-cover shrink-0 border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const fallback = el.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="w-12 h-12 rounded-lg items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-primary)] font-bold text-base shrink-0 border border-[var(--rule-base)]"
            style={{ display: t.logoUrl ? "none" : "flex" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold text-[var(--text-primary)] text-base truncate">
                {t.name}
              </div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${t.active ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]"}`}
                title={t.active ? "Activo" : "Suspendido"}
              />
            </div>
            <div className="text-[var(--text-tertiary)] text-xs font-mono">{t.slug}</div>
            {t.ownerEmail && (
              <div className="text-[var(--text-tertiary)] text-[length:var(--ts-xs)] truncate mt-0.5">
                {t.ownerEmail}
              </div>
            )}
          </div>
        </div>

        {/* Fila de señales — chips uniformes (h-6), una sola línea con wrap
            limpio. Solo se renderiza si hay algo que mostrar. "Enterprise"
            ya NO se repite acá (redundante con "Plan Enterprise" del kicker). */}
        {(pendingCount > 0 || trialBadge || isOnMarketplace || health.isAdmin || !health.ok) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingModalOpen(true);
                }}
                title={`${pendingCount} pedido${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"} — click para ver detalles`}
                className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold bg-[var(--data-error-500)] text-white shadow-sm hover:bg-[var(--data-error-600)] transition-colors"
              >
                <Bell className="w-3 h-3" strokeWidth={2.5} />
                <span className="tabular-nums">{pendingCount} pend.</span>
              </button>
            )}
            {trialBadge && (
              <button
                type="button"
                onClick={async () => {
                  const input = window.prompt(
                    `Extender trial de "${t.name}"\n` +
                      `Vence: ${trialEnds ? trialEnds.toLocaleDateString("es-PE") : "—"}\n\n` +
                      `Cuántos días sumar? (negativo = restar)`,
                    "15",
                  );
                  if (input == null) return;
                  const days = Number(input);
                  if (!Number.isFinite(days) || days === 0) return;
                  try {
                    const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
                    const r = await fetch(`/api/superadmin/tenants/${t.slug}/extend-trial`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(csrf ? { "x-csrf-token": csrf } : {}),
                      },
                      credentials: "include",
                      body: JSON.stringify({ days }),
                    });
                    if (!r.ok) {
                      const data = await r.json().catch((err) => { logger.warn("[tenant-card] extend-trial response parse failed", { error: String(err) }); return null; });
                      window.alert(`Error: ${data?.error ?? r.statusText}`);
                      return;
                    }
                    window.location.reload();
                  } catch (err) {
                    window.alert(`Error de red: ${String(err)}`);
                  }
                }}
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-bold transition-all hover:scale-[1.02] ${trialBadge.bg} ${trialBadge.border} ${trialBadge.fg}`}
                title={`${trialEnds ? `Vence ${trialEnds.toLocaleDateString("es-PE")} · ` : ""}Click para extender o reducir el trial`}
              >
                <trialBadge.Icon className="w-3 h-3" strokeWidth={2.25} />
                {trialBadge.text}
              </button>
            )}
            {isOnMarketplace && (
              <ProductBadge intent="fresh">
                <ShoppingBag className="w-2.5 h-2.5 mr-1 inline" />
                Marketplace
              </ProductBadge>
            )}
            {health.isAdmin && <ProductBadge intent="premium">Admin</ProductBadge>}
            {!health.ok && (
              /* Brandon 2026-06-17: "problema" es alerta (rojo), no "oferta" (ámbar).
                 intent="new" (neutro) + override rojo de la familia --data-error. */
              <ProductBadge
                intent="new"
                className="!bg-[var(--data-error-50)] !text-[var(--data-error-600)] !border-transparent dark:!bg-red-950/30 dark:!text-red-400"
              >
                {health.issues.length} problema{health.issues.length !== 1 ? "s" : ""}
              </ProductBadge>
            )}
          </div>
        )}
    </>
  );
}
