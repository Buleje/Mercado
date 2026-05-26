"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X, Building2, ExternalLink, Loader2,
  Copy, Globe, RotateCcw, KeyRound, ShoppingBag,
  Eye, EyeOff, AlertTriangle,
} from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";
import { SunatOficialToggle } from "@/components/superadmin/tenants/SunatOficialToggle";

interface TenantDetailModalProps {
  tenant: TenantRow;
  onClose: () => void;
}

function fmtD(d: string | null) {
  return d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function fmtMoney(n: number) {
  return `S/${n.toFixed(2)}`;
}

function unlimited(v: number) {
  return v === -1 ? "∞" : v.toLocaleString("es-PE");
}

function pct(u: number, m: number) {
  return m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
}

/**
 * SECURITY 2026-05-16 (P0 fix): eliminado el storage de credenciales en
 * `localStorage["sa-cred-${slug}"]`. Antes este modal guardaba
 * {username, password} como JSON en plaintext — robable por cualquier
 * XSS o extensión maliciosa. El feature "Guardar credenciales" + "Iniciar
 * como X" usaba `?auto=1` en /admin/login para auto-rellenar.
 *
 * Ahora:
 *  - Reset password muestra la contraseña temporal SOLO en `resetResult`
 *    (estado React efímero, vive en memoria del componente).
 *  - El superadmin debe copiarla a su gestor de contraseñas y pegarla
 *    manualmente en la pestaña de admin/login (que ya tiene autocomplete
 *    de browser).
 *  - Eliminados: handleSaveCredentials (prompt → localStorage),
 *    handleLoginWithSaved (auto-login URL), renderSavedCredentials,
 *    useEffect de lectura de localStorage.
 */
export function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const t = tenant;
  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);
  const storeInfo = t.stores?.[0];

  const handleResetPassword = async () => {
    // P0 fix 2026-05-24: TOTP step-up obligatorio en server.
    const totpCode = window.prompt(
      `Código TOTP (6 dígitos) para resetear contraseña de "${t.name}":`,
    );
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      setResetResult("Código TOTP inválido — operación cancelada");
      return;
    }
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch(
        `/api/superadmin/tenants/${t.slug}/reset-password`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ totpCode }),
        },
      );
      const data = await res.json() as { tempPassword?: string; error?: string };
      if (res.ok && data.tempPassword) {
        setResetResult(data.tempPassword);
      } else {
        setResetResult(res.ok ? null : `Error: ${data.error ?? "No se pudo resetear"}`);
      }
    } catch { setResetResult("Error de red."); }
    finally { setResetLoading(false); }
  };

  const handleCopyInfo = () => {
    void navigator.clipboard.writeText([`Tenant: ${t.name} (${t.slug})`, `Email: ${t.ownerEmail ?? "—"}`, `Plan: ${t.plan}`].join("\n"));
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  };

  const handleCopyTempPassword = () => {
    if (!resetResult || resetResult.startsWith("Error")) return;
    void navigator.clipboard.writeText(resetResult);
    setTempPasswordCopied(true);
    setTimeout(() => setTempPasswordCopied(false), 2000);
  };

  const handleOpenAdminLogin = () => {
    // Solo precarga el username "admin" (no el password). El superadmin
    // debe pegar la contraseña manualmente — no se transmite por URL.
    const loginUrl = `/admin/login?user=admin&tenant=${encodeURIComponent(t.slug)}`;
    window.open(loginUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-teal-800/30 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[var(--accent)]" /> {t.name}
            </h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
            {t.ownerEmail && <p className="text-[var(--text-tertiary)] text-xs mt-0.5">{t.ownerEmail}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={t.plan} />
            <StatusBadge active={t.active} />
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] text-gray-400 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { value: t._count.AdminUser, label: "Usuarios", color: "text-[var(--text-primary)]" },
            { value: t.usage?.products ?? 0, label: "Productos", color: "text-[var(--text-primary)]" },
            { value: t.monthOrders ?? t.usage?.ordersThisMonth ?? 0, label: "Pedidos/mes", color: "text-[var(--data-success-500)]" },
            { value: fmtMoney(t.monthRevenue ?? 0), label: "Ventas/mes", color: "text-[var(--data-success-500)]" },
            { value: fmtMoney(t.monthProfit ?? 0), label: "Ganancia", color: (t.monthProfit ?? 0) >= 0 ? "text-[var(--accent-dark)]" : "text-[var(--data-error-500)]" },
          ].map(({ value, label, color }) => (
            <div key={label} className="bg-[var(--surface-sunken)]/50 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${color}`}>{value}</div>
              <div className="text-gray-500 text-[length:var(--ts-xs)] mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Marketplace info */}
        {storeInfo && (
          <div className="bg-[var(--surface-sunken)]/50 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Marketplace</span>
              <span className={`px-2 py-0.5 rounded-full text-[length:var(--ts-xs)] font-semibold ${storeInfo.isPublished ? "bg-teal-100 dark:bg-teal-900/40 text-[var(--accent)]" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                {storeInfo.isPublished ? "Publicada" : "No publicada"}
              </span>
            </div>
            {storeInfo.isPublished && (
              <a href={`/marketplace/tienda/${storeInfo.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                Ver en marketplace <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Credentials section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-tertiary)] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--accent)]" /> Credenciales y Acceso
          </h3>
          <div className="bg-[var(--surface-sunken)]/60 border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400 uppercase tracking-wider text-[length:var(--ts-xs)]">Email</span><p className="text-[var(--text-secondary)] mt-0.5">{t.ownerEmail ?? "—"}</p></div>
              <div><span className="text-gray-400 uppercase tracking-wider text-[length:var(--ts-xs)]">Slug</span><p className="text-[var(--text-secondary)] mt-0.5 font-mono">{t.slug}</p></div>
              <div><span className="text-gray-400 uppercase tracking-wider text-[length:var(--ts-xs)]">Teléfono</span><p className="text-[var(--text-secondary)] mt-0.5">{t.ownerPhone ?? "—"}</p></div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[length:var(--ts-xs)]">Contraseña</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-gray-500">{showPass ? "Encriptada — usar reset o guardar manual" : "••••••••"}</p>
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="text-gray-400 hover:text-[var(--accent)]">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {t.stripeCustomerId && (
                <div><span className="text-gray-400 uppercase tracking-wider text-[length:var(--ts-xs)]">Stripe ID</span><p className="text-[var(--text-secondary)] mt-0.5 font-mono truncate">{t.stripeCustomerId}</p></div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button type="button" onClick={handleCopyInfo} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-primary)] text-xs font-semibold">
                <Copy className="w-3.5 h-3.5" /> {credCopied ? "¡Copiado!" : "Copiar info"}
              </button>
              <button type="button" onClick={() => void handleResetPassword()} disabled={resetLoading} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/40 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs font-semibold disabled:opacity-50">
                {resetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset contraseña
              </button>
              <button type="button" onClick={handleOpenAdminLogin} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-primary)] text-xs font-semibold">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir login
              </button>
            </div>
            {/*
              SECURITY 2026-05-16: la contraseña temporal del reset se
              muestra UNA SOLA VEZ tras ejecutar el reset. NO se persiste
              en localStorage ni se transmite por URL. El superadmin debe
              copiarla manualmente (botón "Copiar") y pegarla en el form
              de admin/login que abre la pestaña.
            */}
            {resetResult && (
              <div className="text-xs bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 border-2 border-[var(--data-warning-500)]/40 rounded-lg px-3 py-2.5 space-y-2">
                <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning-500)] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Contraseña temporal (se muestra una sola vez)
                </p>
                {resetResult.startsWith("Error") ? (
                  <p className="font-mono text-[var(--data-error-500)]">{resetResult}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-sm font-extrabold text-[var(--text-primary)] bg-[var(--surface-raised)] px-2 py-1 rounded select-all">
                      {showPass ? resetResult : "•".repeat(Math.max(6, resetResult.length))}
                    </code>
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="text-[var(--text-tertiary)] hover:text-[var(--accent)]" aria-label="Mostrar/ocultar">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={handleCopyTempPassword} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--data-warning-500)] text-white text-xs font-extrabold">
                      <Copy className="w-3 h-3" /> {tempPasswordCopied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Plan usage */}
        {t.usage && t.limits && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-tertiary)]">Uso del plan</h3>
            {(
              [
                { label: "Productos", used: t.usage.products, max: t.limits.maxProducts },
                { label: "Usuarios", used: t.usage.users, max: t.limits.maxUsers },
                { label: "Pedidos/mes", used: t.usage.ordersThisMonth, max: t.limits.maxOrdersPerMonth },
              ] as const
            ).map(({ label, used, max }) => {
              const p = pct(used, max);
              const full = max !== -1 && p >= 100;
              const warn = max !== -1 && p >= 80 && !full;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--text-secondary)]">{label}</span>
                    <span className={full ? "text-[var(--data-error-500)] font-bold" : warn ? "text-[var(--data-warning-500)]" : "text-gray-400"}>
                      {used.toLocaleString("es-PE")} / {unlimited(max)}
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                    {max === -1
                      ? <div className="h-full bg-gray-300 dark:bg-gray-600/30 rounded-full w-full" />
                      : <div className={`h-full rounded-full ${full ? "bg-[var(--data-error-500)]" : warn ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]"}`} style={{ width: `${p}%` }} />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Billing */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-tertiary)]">Facturación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              { label: "Stripe Customer", value: t.stripeCustomerId ?? "—" },
              { label: "Subscription", value: t.stripeSubscriptionId ?? "—" },
              { label: "Periodo vence", value: fmtD(t.stripeCurrentPeriodEnd) },
              { label: "Trial termina", value: fmtD(t.trialEndsAt) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2">
                <span className="text-gray-400">{label}</span>
                <p className="text-[var(--text-secondary)] font-mono truncate">{value}</p>
              </div>
            ))}
          </div>
          {t.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs bg-[var(--data-warning-50)] dark:bg-orange-950/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4" /> Esta tienda cancelará al final del periodo.
            </div>
          )}
        </div>

        {/* Modo SUNAT Oficial — toggle controlado por superadmin (ADR-123) */}
        <SunatOficialToggle slug={t.slug} />

        {/* Custom domain */}
        {t.customDomain && (
          <div className="bg-[var(--surface-sunken)]/50 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-400">Dominio personalizado</span>
            <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold flex items-center gap-1.5 mt-0.5">
              <Globe className="w-4 h-4" /> {t.customDomain}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
