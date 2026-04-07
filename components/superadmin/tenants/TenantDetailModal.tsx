"use client";

import { useState, useEffect } from "react";
import {
  X, Building2, ExternalLink, Loader2,
  Copy, Globe, RotateCcw, KeyRound, ShoppingBag,
  Eye, EyeOff, LogIn, AlertTriangle,
} from "lucide-react";
import type { TenantRow } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";

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

interface SavedCredential {
  username: string;
  password: string;
  savedAt?: string;
}

export function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const t = tenant;
  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<string | null>(null);
  const storeInfo = t.stores?.[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`sa-cred-${t.slug}`);
      if (saved) setSavedCredentials(saved);
    } catch { /* silent */ }
  }, [t.slug]);

  const handleResetPassword = async () => {
    setResetLoading(true); setResetResult(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/reset-password`, { method: "POST", credentials: "include" });
      const data = await res.json() as { tempPassword?: string; error?: string };
      if (res.ok && data.tempPassword) {
        setResetResult(`Contraseña temporal: ${data.tempPassword}`);
        try {
          localStorage.setItem(`sa-cred-${t.slug}`, JSON.stringify({
            username: "admin",
            password: data.tempPassword,
            savedAt: new Date().toISOString(),
          }));
          setSavedCredentials(JSON.stringify({ username: "admin", password: data.tempPassword }));
        } catch { /* silent */ }
      } else {
        setResetResult(res.ok ? "Reset enviado." : `Error: ${data.error ?? "No se pudo resetear"}`);
      }
    } catch { setResetResult("Error de red."); }
    finally { setResetLoading(false); }
  };

  const handleSaveCredentials = () => {
    const username = prompt("Usuario de la tienda:", "admin");
    if (!username) return;
    const password = prompt("Contraseña:");
    if (!password) return;
    try {
      const cred = JSON.stringify({ username, password, savedAt: new Date().toISOString() });
      localStorage.setItem(`sa-cred-${t.slug}`, cred);
      setSavedCredentials(cred);
    } catch { /* silent */ }
  };

  const handleLoginWithSaved = () => {
    if (!savedCredentials) return;
    try {
      const cred = JSON.parse(savedCredentials) as SavedCredential;
      const loginUrl = `/admin/login?user=${encodeURIComponent(cred.username)}&tenant=${encodeURIComponent(t.slug)}&auto=1`;
      window.open(loginUrl, "_blank");
    } catch { /* silent */ }
  };

  const handleCopyInfo = () => {
    void navigator.clipboard.writeText([`Tenant: ${t.name} (${t.slug})`, `Email: ${t.ownerEmail ?? "—"}`, `Plan: ${t.plan}`].join("\n"));
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  };

  const renderSavedCredentials = () => {
    if (!savedCredentials) return null;
    try {
      const cred = JSON.parse(savedCredentials) as SavedCredential;
      return (
        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-700/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wider">Credenciales guardadas</span>
            {cred.savedAt && <span className="text-[9px] text-teal-500">{new Date(cred.savedAt).toLocaleDateString("es-PE")}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-teal-500 text-[10px]">Usuario</span><p className="font-mono text-teal-800 dark:text-teal-200">{cred.username}</p></div>
            <div><span className="text-teal-500 text-[10px]">Contraseña</span><p className="font-mono text-teal-800 dark:text-teal-200">{showPass ? cred.password : "••••••"}</p></div>
          </div>
        </div>
      );
    } catch { return null; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-500" /> {t.name}
            </h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
            {t.ownerEmail && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{t.ownerEmail}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={t.plan} />
            <StatusBadge active={t.active} />
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { value: t._count.AdminUser, label: "Usuarios", color: "text-gray-900 dark:text-white" },
            { value: t.usage?.products ?? 0, label: "Productos", color: "text-gray-900 dark:text-white" },
            { value: t.monthOrders ?? t.usage?.ordersThisMonth ?? 0, label: "Pedidos/mes", color: "text-blue-600" },
            { value: fmtMoney(t.monthRevenue ?? 0), label: "Ventas/mes", color: "text-green-600" },
            { value: fmtMoney(t.monthProfit ?? 0), label: "Ganancia", color: (t.monthProfit ?? 0) >= 0 ? "text-teal-600" : "text-red-500" },
          ].map(({ value, label, color }) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${color}`}>{value}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Marketplace info */}
        {storeInfo && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Marketplace</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${storeInfo.isPublished ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                {storeInfo.isPublished ? "Publicada" : "No publicada"}
              </span>
            </div>
            {storeInfo.isPublished && (
              <a href={`/marketplace/tienda/${storeInfo.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
                Ver en marketplace <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Credentials section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-500" /> Credenciales y Acceso
          </h3>
          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400 uppercase tracking-wider text-[10px]">Email</span><p className="text-gray-700 dark:text-gray-200 mt-0.5">{t.ownerEmail ?? "—"}</p></div>
              <div><span className="text-gray-400 uppercase tracking-wider text-[10px]">Slug</span><p className="text-gray-700 dark:text-gray-200 mt-0.5 font-mono">{t.slug}</p></div>
              <div><span className="text-gray-400 uppercase tracking-wider text-[10px]">Teléfono</span><p className="text-gray-700 dark:text-gray-200 mt-0.5">{t.ownerPhone ?? "—"}</p></div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Contraseña</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-gray-500">{showPass ? "Encriptada — usar reset o guardar manual" : "••••••••"}</p>
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="text-gray-400 hover:text-teal-500">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {t.stripeCustomerId && (
                <div><span className="text-gray-400 uppercase tracking-wider text-[10px]">Stripe ID</span><p className="text-gray-700 dark:text-gray-200 mt-0.5 font-mono truncate">{t.stripeCustomerId}</p></div>
              )}
            </div>

            {renderSavedCredentials()}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button type="button" onClick={handleCopyInfo} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-xs font-semibold">
                <Copy className="w-3.5 h-3.5" /> {credCopied ? "¡Copiado!" : "Copiar info"}
              </button>
              <button type="button" onClick={() => void handleResetPassword()} disabled={resetLoading} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-300 text-xs font-semibold disabled:opacity-50">
                {resetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset contraseña
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={handleSaveCredentials} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700/40 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60">
                <KeyRound className="w-3.5 h-3.5" /> Guardar credenciales
              </button>
              {savedCredentials && (
                <button type="button" onClick={handleLoginWithSaved} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-semibold" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
                  <LogIn className="w-3.5 h-3.5" /> Iniciar como {t.name}
                </button>
              )}
            </div>
            {resetResult && (
              <div className="text-xs bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-700/40 text-teal-700 dark:text-teal-300 rounded-lg px-3 py-2 font-mono">
                {resetResult}
              </div>
            )}
          </div>
        </div>

        {/* Plan usage */}
        {t.usage && t.limits && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Uso del plan</h3>
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
                    <span className="text-gray-700 dark:text-gray-300">{label}</span>
                    <span className={full ? "text-red-500 font-bold" : warn ? "text-amber-500" : "text-gray-400"}>
                      {used.toLocaleString("es-PE")} / {unlimited(max)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    {max === -1
                      ? <div className="h-full bg-gray-300 dark:bg-gray-600/30 rounded-full w-full" />
                      : <div className={`h-full rounded-full ${full ? "bg-red-500" : warn ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${p}%` }} />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Billing */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Facturación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              { label: "Stripe Customer", value: t.stripeCustomerId ?? "—" },
              { label: "Subscription", value: t.stripeSubscriptionId ?? "—" },
              { label: "Periodo vence", value: fmtD(t.stripeCurrentPeriodEnd) },
              { label: "Trial termina", value: fmtD(t.trialEndsAt) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <span className="text-gray-400">{label}</span>
                <p className="text-gray-700 dark:text-gray-300 font-mono truncate">{value}</p>
              </div>
            ))}
          </div>
          {t.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs bg-orange-50 dark:bg-orange-950/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4" /> Esta tienda cancelará al final del periodo.
            </div>
          )}
        </div>

        {/* Custom domain */}
        {t.customDomain && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-400">Dominio personalizado</span>
            <p className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <Globe className="w-4 h-4" /> {t.customDomain}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
