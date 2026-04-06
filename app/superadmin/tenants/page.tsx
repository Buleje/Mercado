"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Building2, ChevronDown, ExternalLink,
  RefreshCw, Loader2, CheckCircle2, XCircle,
  Mail, X, Copy, Globe, RotateCcw, KeyRound, LayoutGrid, List,
  AlertTriangle, Users, Store, TrendingUp, DollarSign,
  Package, ShoppingCart, Eye, EyeOff, LogIn, ArrowUpRight,
  ArrowDownRight, ShoppingBag, BarChart3, Trash2, Bomb, Eraser,
} from "lucide-react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = "name" | "plan" | "createdAt" | "ordersThisMonth";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "cards";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}

function MiniUsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const color = unlimited
    ? "bg-gray-400 dark:bg-gray-600"
    : pct >= 100
    ? "bg-red-500"
    : pct >= 80
    ? "bg-amber-400"
    : "bg-teal-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
        <span>{label}</span>
        <span className={pct >= 100 ? "text-red-400" : pct >= 80 ? "text-amber-400" : ""}>
          {unlimited ? "∞" : `${used}/${max}`}
        </span>
      </div>
      <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden w-24">
        {!unlimited && (
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        )}
        {unlimited && (
          <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full w-full opacity-30" />
        )}
      </div>
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ tenantSlug, tenantName, onClose }: { tenantSlug: string; tenantName: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) { setError("Introduce un email"); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/invite", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug }, body: JSON.stringify({ email: email.trim(), role }) });
      const data = await res.json() as { inviteUrl?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setInviteUrl(data.inviteUrl ?? null);
    } catch { setError("Error de red"); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><h2 className="font-bold text-gray-900 dark:text-white">Invitar usuario</h2><p className="text-gray-500 text-xs mt-0.5"><span className="text-gray-700 dark:text-gray-300">{tenantName}</span> <span className="font-mono">({tenantSlug})</span></p></div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        {!inviteUrl ? (
          <>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email del invitado</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.com" className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40" /></div>
              <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                  <option value="admin">Administrador</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                </select></div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl disabled:opacity-50 text-white text-sm font-semibold" style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Generar enlace
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm"><CheckCircle2 className="w-4 h-4 shrink-0" /> Enlace generado.</div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-xs font-mono break-all">{inviteUrl}</div>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(inviteUrl ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-semibold">
              <Copy className="w-4 h-4" /> {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <p className="text-gray-400 text-xs text-center">El enlace expira en 72 horas.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tenant Detail Modal ──────────────────────────────────────────────────────

function TenantDetailModal({ tenant, onClose }: { tenant: TenantRow; onClose: () => void }) {
  const t = tenant;
  const unlimited = (v: number) => (v === -1 ? "∞" : v.toLocaleString("es-PE"));
  const pct = (u: number, m: number) => (m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100)));
  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<string | null>(null);
  const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const fmtMoney = (n: number) => `S/${n.toFixed(2)}`;
  const storeInfo = t.stores?.[0];

  // Load saved credentials from localStorage
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
        // Auto-save credentials
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
      const cred = JSON.parse(savedCredentials) as { username: string; password: string };
      const loginUrl = `/admin/login?user=${encodeURIComponent(cred.username)}&tenant=${encodeURIComponent(t.slug)}&auto=1`;
      window.open(loginUrl, "_blank");
    } catch { /* silent */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-500" /> {t.name}</h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
            {t.ownerEmail && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{t.ownerEmail}</p>}
          </div>
          <div className="flex items-center gap-2"><PlanBadge plan={t.plan} /><StatusBadge active={t.active} /><button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 ml-2"><X className="w-4 h-4" /></button></div>
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
            <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center"><div className={`text-lg font-bold ${color}`}>{value}</div><div className="text-gray-500 text-[10px] mt-0.5">{label}</div></div>
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

        {/* Credentials section — enhanced */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2"><KeyRound className="w-4 h-4 text-teal-500" /> Credenciales y Acceso</h3>
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
              {t.stripeCustomerId && <div><span className="text-gray-400 uppercase tracking-wider text-[10px]">Stripe ID</span><p className="text-gray-700 dark:text-gray-200 mt-0.5 font-mono truncate">{t.stripeCustomerId}</p></div>}
            </div>

            {/* Saved credentials section */}
            {savedCredentials && (() => {
              try {
                const cred = JSON.parse(savedCredentials) as { username: string; password: string; savedAt?: string };
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
            })()}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button type="button" onClick={() => { void navigator.clipboard.writeText([`Tenant: ${t.name} (${t.slug})`, `Email: ${t.ownerEmail ?? "—"}`, `Plan: ${t.plan}`].join("\n")); setCredCopied(true); setTimeout(() => setCredCopied(false), 2000); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-xs font-semibold">
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
            {resetResult && <div className="text-xs bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-700/40 text-teal-700 dark:text-teal-300 rounded-lg px-3 py-2 font-mono">{resetResult}</div>}
          </div>
        </div>
        {t.usage && t.limits && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Uso del plan</h3>
            {([{ label: "Productos", used: t.usage.products, max: t.limits.maxProducts }, { label: "Usuarios", used: t.usage.users, max: t.limits.maxUsers }, { label: "Pedidos/mes", used: t.usage.ordersThisMonth, max: t.limits.maxOrdersPerMonth }] as const).map(({ label, used, max }) => {
              const p = pct(used, max); const full = max !== -1 && p >= 100; const warn = max !== -1 && p >= 80 && !full;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-700 dark:text-gray-300">{label}</span><span className={full ? "text-red-500 font-bold" : warn ? "text-amber-500" : "text-gray-400"}>{used.toLocaleString("es-PE")} / {unlimited(max)}</span></div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    {max === -1 ? <div className="h-full bg-gray-300 dark:bg-gray-600/30 rounded-full w-full" /> : <div className={`h-full rounded-full ${full ? "bg-red-500" : warn ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${p}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Facturación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[{ label: "Stripe Customer", value: t.stripeCustomerId ?? "—" }, { label: "Subscription", value: t.stripeSubscriptionId ?? "—" }, { label: "Periodo vence", value: fmtD(t.stripeCurrentPeriodEnd) }, { label: "Trial termina", value: fmtD(t.trialEndsAt) }].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2"><span className="text-gray-400">{label}</span><p className="text-gray-700 dark:text-gray-300 font-mono truncate">{value}</p></div>
            ))}
          </div>
          {t.cancelAtPeriodEnd && <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs bg-orange-50 dark:bg-orange-950/30 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4" /> Esta tienda cancelará al final del periodo.</div>}
        </div>
        {t.customDomain && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-400">Dominio personalizado</span>
            <p className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5"><Globe className="w-4 h-4" /> {t.customDomain}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteConfirmModal({ name, slug, onConfirm, onCancel, loading }: {
  name: string; slug: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === slug;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Eliminar tienda</h3>
            <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará permanentemente:
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 ml-6 list-disc">
            <li>La tienda <strong>&ldquo;{name}&rdquo;</strong> ({slug})</li>
            <li>Todos sus productos, pedidos, ventas e historial</li>
            <li>Todos sus clientes, proveedores y usuarios</li>
            <li>Toda su configuración, inventario y datos financieros</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            Escribe <strong className="text-red-600 font-mono">{slug}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={slug}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar permanentemente
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nuclear Reset Confirmation Modal ─────────────────────────────────────────

function NuclearResetModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  const [typed, setTyped] = useState("");
  const CONFIRM_TEXT = "BORRAR TODO";
  const confirmed = typed === CONFIRM_TEXT;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <Bomb className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-600">Borrar TODOS los datos</h3>
            <p className="text-sm text-gray-500">Reinicio total del sistema</p>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará TODO de TODAS las tiendas:
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 ml-6 list-disc">
            <li>Todos los productos, pedidos, ventas e historial</li>
            <li>Todos los clientes, proveedores y lotes</li>
            <li>Toda la configuración, inventario y datos financieros</li>
            <li>Todas las actividades, notificaciones y mensajes</li>
            <li>El sistema quedará <strong>completamente limpio</strong>, como recién instalado</li>
          </ul>
          <p className="text-xs text-red-700 dark:text-red-300 mt-2 font-semibold">
            Las tiendas (tenants) se mantienen, pero sin ningún dato dentro.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            Escribe <strong className="text-red-600 font-mono">{CONFIRM_TEXT}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bomb className="w-4 h-4" />}
            Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant Card (cards view) — ENHANCED BIG CARD ─────────────────────────────

function TenantCard({ tenant, onDetail, onInvite, onToggleActive, actionLoading, onImpersonate, onToggleMarketplace, onLoginAs, onDelete, onPurge }: {
  tenant: TenantRow; onDetail: (t: TenantRow) => void; onInvite: (slug: string, name: string) => void;
  onToggleActive: (slug: string, active: boolean) => void; actionLoading: string | null; onImpersonate: (slug: string) => void;
  onToggleMarketplace: (tenant: TenantRow) => void; onLoginAs: (tenant: TenantRow) => void; onDelete: (slug: string, name: string) => void;
  onPurge: (slug: string, name: string) => void;
}) {
  const t = tenant;
  const CARD_BG: Record<PlanId, string> = { free: "#6b7280", pro: "#00B4A6", business: "#7c3aed", enterprise: "#d97706" };
  const initials = t.name.slice(0, 2).toUpperCase();
  const pctFn = (u: number, m: number) => (m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100)));
  const totalUsagePct = t.usage && t.limits ? Math.round((pctFn(t.usage.products, t.limits.maxProducts) + pctFn(t.usage.users, t.limits.maxUsers) + pctFn(t.usage.ordersThisMonth, t.limits.maxOrdersPerMonth)) / 3) : 0;
  const fmtMoney = (n: number) => `S/${n.toFixed(0)}`;
  const storeInfo = t.stores?.[0];
  const isOnMarketplace = storeInfo?.isPublished === true;
  const hasStore = (t.stores?.length ?? 0) > 0;
  const revenue = t.monthRevenue ?? 0;
  const expenses = t.monthExpenses ?? 0;
  const profit = t.monthProfit ?? 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:border-teal-300 dark:hover:border-teal-700 transition-all hover:shadow-md overflow-hidden">
      {/* Card header with gradient strip */}
      <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${CARD_BG[t.plan] ?? CARD_BG.free}, ${CARD_BG[t.plan] ?? CARD_BG.free}88)` }} />

      <div className="p-5 space-y-4">
        {/* Top: Avatar + Name + Status */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${CARD_BG[t.plan] ?? CARD_BG.free}, ${CARD_BG[t.plan] ?? CARD_BG.free}99)` }}>{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold text-gray-900 dark:text-white text-base truncate">{t.name}</div>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.active ? "bg-green-500" : "bg-red-500"}`} />
            </div>
            <div className="text-gray-400 text-xs font-mono">{t.slug}</div>
            {t.ownerEmail && <div className="text-gray-400 text-[10px] truncate mt-0.5">{t.ownerEmail}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <PlanBadge plan={t.plan} />
            {isOnMarketplace && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-[9px] font-semibold text-teal-700 dark:text-teal-300">
                <ShoppingBag className="w-2.5 h-2.5" /> Marketplace
              </span>
            )}
          </div>
        </div>

        {/* Financial KPIs — 4 columns */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: fmtMoney(revenue), lbl: "Ventas mes", icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
            { val: fmtMoney(expenses), lbl: "Gastos mes", icon: ArrowDownRight, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
            { val: fmtMoney(profit), lbl: "Ganancia", icon: TrendingUp, color: profit >= 0 ? "text-teal-600" : "text-red-500", bg: profit >= 0 ? "bg-teal-50 dark:bg-teal-950/30" : "bg-red-50 dark:bg-red-950/30" },
            { val: String(t.monthOrders ?? 0), lbl: "Pedidos mes", icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          ].map(({ val, lbl, icon: Icon, color, bg }) => (
            <div key={lbl} className={`${bg} rounded-xl p-2 text-center`}>
              <Icon className={`w-3 h-3 mx-auto mb-0.5 ${color}`} />
              <div className={`text-sm font-extrabold ${color}`}>{val}</div>
              <div className="text-[9px] text-gray-400 leading-tight">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Resources: Products, Inventory, Users */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: t.usage?.products ?? 0, lbl: "Productos", icon: Package, max: t.limits?.maxProducts ?? -1 },
            { val: t._count.AdminUser, lbl: "Usuarios", icon: Users, max: t.limits?.maxUsers ?? -1 },
            { val: storeInfo?._count.products ?? 0, lbl: "En Marketplace", icon: Store, max: -1 },
          ].map(({ val, lbl, icon: Icon, max }) => {
            const pct = max === -1 ? 0 : Math.min(100, Math.round((val / max) * 100));
            const isEmpty = val === 0 && lbl !== "Usuarios";
            return (
              <div key={lbl} className={`rounded-xl p-2.5 text-center ${isEmpty ? "bg-gray-50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-800/50"}`}>
                <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-400"}`} />
                <div className={`text-base font-bold ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-white"}`}>{val}</div>
                <div className={`text-[9px] ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-400"}`}>{isEmpty ? "Sin datos" : lbl}</div>
                {max !== -1 && !isEmpty && (
                  <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Plan usage bar */}
        {t.usage && t.limits && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400"><span>Uso del plan</span><span className={totalUsagePct >= 100 ? "text-red-500" : totalUsagePct >= 80 ? "text-amber-500" : "text-teal-500"}>{totalUsagePct}%</span></div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${totalUsagePct >= 100 ? "bg-red-500" : totalUsagePct >= 80 ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${totalUsagePct}%` }} /></div>
          </div>
        )}

        {/* Action buttons — row 1: Primary actions */}
        <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <a
            href={`/tienda`}
            onClick={(e) => { e.preventDefault(); window.open(`/t/${t.slug}/tienda`, "_blank"); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
          >
            <Store className="w-3.5 h-3.5" /> Ir a Tienda
          </a>
          <button type="button" onClick={() => onImpersonate(t.slug)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}><ExternalLink className="w-3.5 h-3.5" /> Panel Admin</button>
        </div>

        {/* Action buttons — row 2: Marketplace + Login */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleMarketplace(t)}
            disabled={actionLoading === `${t.slug}-marketplace`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
              isOnMarketplace
                ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                : hasStore
                ? "border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950"
                : "border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            {actionLoading === `${t.slug}-marketplace` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isOnMarketplace ? (
              <><ArrowDownRight className="w-3.5 h-3.5" /> Dar de baja</>
            ) : hasStore ? (
              <><ArrowUpRight className="w-3.5 h-3.5" /> Subir a Marketplace</>
            ) : (
              <><ShoppingBag className="w-3.5 h-3.5" /> Sin tienda</>
            )}
          </button>
          <button
            type="button"
            onClick={() => onLoginAs(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
          </button>
        </div>

        {/* Action buttons — row 3: Invite + Suspend + Purge + Delete */}
        <div className="flex gap-2">
          <button type="button" onClick={() => onInvite(t.slug, t.name)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors"><Mail className="w-3.5 h-3.5" /> Invitar</button>
          <button type="button" onClick={() => onToggleActive(t.slug, t.active)} disabled={actionLoading === `${t.slug}-active`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${t.active ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"}`}>
            {actionLoading === `${t.slug}-active` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.active ? <><XCircle className="w-3.5 h-3.5" /> Suspender</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activar</>}
          </button>
          <button type="button" onClick={() => onPurge(t.slug, t.name)} disabled={actionLoading === `${t.slug}-purge`}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors disabled:opacity-50"
            title="Limpiar datos de esta tienda (productos, pedidos, movimientos)">
            {actionLoading === `${t.slug}-purge` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => onDelete(t.slug, t.name)} disabled={actionLoading === `${t.slug}-delete` || t.slug === "main"}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"}>
            {actionLoading === `${t.slug}-delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => onDetail(t)} className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan change dropdown ──────────────────────────────────────────────────────

function PlanSelect({
  slug,
  current,
  onChanged,
}: {
  slug: string;
  current: PlanId;
  onChanged: (newPlan: PlanId) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (plan: PlanId) => {
    if (plan === current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) onChanged(plan);
    } finally {
      setSaving(false);
    }
  };

  if (saving) return <Loader2 className="w-4 h-4 animate-spin text-teal-500" />;

  return (
    <div className="relative">
      <select
        value={current}
        onChange={(e) => void handleChange(e.target.value as PlanId)}
        className="appearance-none bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 pr-6 text-xs text-gray-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
      >
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="business">Business</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<"all" | PlanId>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [pageTab, setPageTab] = useState<"tiendas" | "crecimiento">("tiendas");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [detailTarget, setDetailTarget] = useState<TenantRow | null>(null);
  const [_credentialsTarget, _setCredentialsTarget] = useState<TenantRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [nuclearResetOpen, setNuclearResetOpen] = useState(false);
  const [nuclearResetLoading, setNuclearResetLoading] = useState(false);
  // Growth tab data
  const [growthData, setGrowthData] = useState<Array<{ slug: string; name: string; plan: string; createdAt: string; months: Array<{ month: string; revenue: number; orders: number }>; totalRevenue: number; totalOrders: number; growthPct: number }>>([]);
  const [growthLoading, setGrowthLoading] = useState(false);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadTenants = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/superadmin/tenants", { credentials: "include" });
      if (!res.ok) { setError("Error al cargar tenants"); return; }
      const data = await res.json() as { tenants: TenantRow[] };
      setTenants(data.tenants);
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true);
    try {
      const res = await fetch("/api/superadmin/tenants/growth", { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as { data: typeof growthData };
        setGrowthData(json.data);
      }
    } catch { /* silent */ }
    finally { setGrowthLoading(false); }
  }, []);

  useEffect(() => { if (pageTab === "crecimiento" && growthData.length === 0) void loadGrowth(); }, [pageTab, growthData.length, loadGrowth]);

  const handleToggleActive = async (slug: string, current: boolean) => {
    setActionLoading(`${slug}-active`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !current }) });
      if (!res.ok) { showToast("Error al actualizar estado", false); return; }
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, active: !current } : t)));
      showToast(`${slug} ${!current ? "activada" : "suspendida"}`);
    } finally { setActionLoading(null); }
  };

  const handlePlanChange = async (slug: string, plan: PlanId) => {
    setActionLoading(`${slug}-plan`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      if (!res.ok) { showToast("Error al cambiar plan", false); return; }
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, plan } : t)));
      showToast(`Plan de ${slug} → ${plan}`);
    } finally { setActionLoading(null); }
  };

  const handleDeleteTenant = async (slug: string, name: string) => {
    setActionLoading(`${slug}-delete`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/delete`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Error" })); showToast((err as { error?: string }).error ?? "Error al eliminar", false); return; }
      setTenants((prev) => prev.filter((t) => t.slug !== slug));
      setDeleteTarget(null);
      showToast(`Tienda "${name}" eliminada`);
    } finally { setActionLoading(null); }
  };

  const handleNuclearReset = async () => {
    setNuclearResetLoading(true);
    try {
      const res = await fetch("/api/superadmin/purge", { method: "DELETE", credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Error" })); showToast((err as { error?: string }).error ?? "Error al limpiar datos", false); return; }
      const data = await res.json() as { deletedRows: number; message: string };
      setNuclearResetOpen(false);
      showToast(data.message ?? `Sistema limpiado — ${data.deletedRows} registros eliminados`);
      await loadTenants();
    } finally { setNuclearResetLoading(false); }
  };

  const handlePurgeTenant = async (slug: string, name: string) => {
    if (!confirm(`¿Limpiar TODOS los datos de "${name}"?\n\nSe eliminarán productos, pedidos, movimientos, ventas y todo el historial.\nLa tienda seguirá activa pero vacía.`)) return;
    setActionLoading(`${slug}-purge`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/purge`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Error" })); showToast((err as { error?: string }).error ?? "Error al limpiar datos", false); return; }
      const data = await res.json() as { deletedRows: number; message: string };
      showToast(data.message ?? `Datos de "${name}" limpiados — ${data.deletedRows} registros eliminados`);
      await loadTenants();
    } finally { setActionLoading(null); }
  };

  const handleImpersonate = async (slug: string) => {
    try {
      const res = await fetch("/api/superadmin/impersonate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      if (!res.ok) { showToast("Error al impersonar", false); return; }
      window.open(`/t/${slug}/admin`, "_blank");
    } catch { showToast("Error de red", false); }
  };

  const handleToggleMarketplace = async (tenant: TenantRow) => {
    const store = tenant.stores?.[0];
    if (!store) { showToast("Esta tienda no tiene Store en marketplace", false); return; }
    const newPublished = !store.isPublished;
    const action = newPublished ? "publicar" : "dar de baja";
    if (!window.confirm(`¿${newPublished ? "Publicar" : "Dar de baja"} "${tenant.name}" ${newPublished ? "en" : "del"} marketplace?`)) return;
    setActionLoading(`${tenant.slug}-marketplace`);
    try {
      const res = await fetch("/api/superadmin/stores", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, isPublished: newPublished }),
      });
      if (!res.ok) { showToast(`Error al ${action}`, false); return; }
      setTenants((prev) => prev.map((t) => {
        if (t.slug !== tenant.slug) return t;
        const updatedStores = (t.stores ?? []).map((s) =>
          s.id === store.id ? { ...s, isPublished: newPublished } : s
        );
        return { ...t, stores: updatedStores };
      }));
      showToast(`${tenant.name} ${newPublished ? "publicada en" : "dada de baja del"} marketplace`);
    } finally { setActionLoading(null); }
  };

  const handleLoginAs = (tenant: TenantRow) => {
    // Open login page with pre-filled credentials using query params
    const loginUrl = `/admin/login?tenant=${encodeURIComponent(tenant.slug)}&auto=1`;
    window.open(loginUrl, "_blank");
    showToast(`Abriendo login como ${tenant.name}...`);
  };

  // Filter + search
  const filtered = tenants.filter((t) => {
    if (search) { const q = search.toLowerCase(); if (!t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q) && !(t.ownerEmail ?? "").toLowerCase().includes(q)) return false; }
    if (filterPlan !== "all" && t.plan !== filterPlan) return false;
    if (filterActive === "active" && !t.active) return false;
    if (filterActive === "inactive" && t.active) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = a.name.localeCompare(b.name);
    else if (sortField === "plan") cmp = a.plan.localeCompare(b.plan);
    else if (sortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    else if (sortField === "ordersThisMonth") cmp = (a.usage?.ordersThisMonth ?? 0) - (b.usage?.ordersThisMonth ?? 0);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="text-gray-300 dark:text-gray-600 ml-1">
      {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const inputCls = "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40";
  const selectCls = `appearance-none ${inputCls} pr-8 text-gray-700 dark:text-gray-300 cursor-pointer`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-500" /> Tenants
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {sorted.length} tienda{sorted.length !== 1 ? "s" : ""}
            {tenants.length !== sorted.length ? ` de ${tenants.length}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Page tabs: Tiendas / Crecimiento */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mr-2">
            {(["tiendas", "crecimiento"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPageTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pageTab === tab ? "bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
              >
                {tab === "tiendas" ? "Tiendas" : "Crecimiento"}
              </button>
            ))}
          </div>
          {/* View mode toggle */}
          {pageTab === "tiendas" && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                title="Vista tabla"
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                title="Vista tarjetas"
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "cards" ? "bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadTenants()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => setNuclearResetOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            title="Borrar todos los datos del sistema"
          >
            <Bomb className="w-4 h-4" />
            Limpiar datos
          </button>
        </div>
      </div>

      {/* Filters */}
      {pageTab === "tiendas" && (<>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, slug o email…"
            className={`w-full ${inputCls} pl-9`}
          />
        </div>
        <div className="relative">
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value as "all" | PlanId)}
            className={selectCls}
          >
            <option value="all">Todos los planes</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
            className={selectCls}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Suspendidas</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          {error}
          <button type="button" onClick={() => void loadTenants()} className="underline hover:no-underline text-xs">
            Reintentar
          </button>
        </div>
      )}

      {/* Cards view */}
      {!loading && viewMode === "cards" && (
        sorted.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            No hay tenants
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {sorted.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onDetail={(t) => setDetailTarget(t)}
                onInvite={(slug, name) => setInviteTarget({ slug, name })}
                onToggleActive={(slug, active) => void handleToggleActive(slug, active)}
                actionLoading={actionLoading}
                onImpersonate={(slug) => void handleImpersonate(slug)}
                onToggleMarketplace={(t) => void handleToggleMarketplace(t)}
                onLoginAs={(t) => handleLoginAs(t)}
                onDelete={(slug, name) => setDeleteTarget({ slug, name })}
                onPurge={(slug, name) => void handlePurgeTenant(slug, name)}
              />
            ))}
          </div>
        )
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando tenants…
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No hay tenants
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 text-xs uppercase tracking-wider bg-gray-50 dark:bg-gray-900/60">
                    <th
                      className="text-left px-5 py-3 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Tienda <SortIcon field="name" />
                    </th>
                    <th
                      className="text-left px-4 py-3 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none"
                      onClick={() => toggleSort("plan")}
                    >
                      Plan <SortIcon field="plan" />
                    </th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Uso</th>
                    <th
                      className="text-right px-4 py-3 hidden lg:table-cell cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none"
                      onClick={() => toggleSort("ordersThisMonth")}
                    >
                      Pedidos/mes <SortIcon field="ordersThisMonth" />
                    </th>
                    <th
                      className="text-left px-4 py-3 hidden lg:table-cell cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none"
                      onClick={() => toggleSort("createdAt")}
                    >
                      Creado <SortIcon field="createdAt" />
                    </th>
                    <th className="text-center px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {sorted.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="hover:bg-teal-50 dark:hover:bg-teal-950/10 transition-colors"
                    >
                      {/* Name + slug */}
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(tenant)}
                          className="text-left hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                        >
                          <div className="font-semibold text-gray-900 dark:text-white">{tenant.name}</div>
                          <div className="text-xs font-mono text-gray-400 mt-0.5">{tenant.slug}</div>
                          {tenant.ownerEmail && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate max-w-48">{tenant.ownerEmail}</div>
                          )}
                        </button>
                      </td>

                      {/* Plan (editable) */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <PlanBadge plan={tenant.plan} />
                          <PlanSelect
                            slug={tenant.slug}
                            current={tenant.plan}
                            onChanged={(p) => void handlePlanChange(tenant.slug, p)}
                          />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge active={tenant.active} />
                        {tenant.cancelAtPeriodEnd && (
                          <div className="text-[10px] text-orange-500 mt-1">Cancela pronto</div>
                        )}
                        {tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date() && (
                          <div className="text-[10px] text-blue-500 mt-1">
                            Trial hasta {fmtDate(tenant.trialEndsAt)}
                          </div>
                        )}
                      </td>

                      {/* Usage bars */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {tenant.usage && tenant.limits ? (
                          <div className="space-y-1">
                            <MiniUsageBar
                              used={tenant.usage.products}
                              max={tenant.limits.maxProducts}
                              label="Prod."
                            />
                            <MiniUsageBar
                              used={tenant.usage.users}
                              max={tenant.limits.maxUsers}
                              label="Users"
                            />
                          </div>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>

                      {/* Orders this month */}
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {tenant.usage?.ordersThisMonth ?? 0}
                        </span>
                        {tenant.limits && tenant.limits.maxOrdersPerMonth !== -1 && (
                          <span className="text-xs text-gray-400 ml-1">
                            / {tenant.limits.maxOrdersPerMonth}
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell whitespace-nowrap">
                        {fmtDate(tenant.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Toggle active */}
                          <button
                            type="button"
                            disabled={actionLoading === `${tenant.slug}-active`}
                            onClick={() => void handleToggleActive(tenant.slug, tenant.active)}
                            title={tenant.active ? "Suspender tienda" : "Activar tienda"}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                              tenant.active
                                ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                : "text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30"
                            }`}
                          >
                            {actionLoading === `${tenant.slug}-active` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : tenant.active ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </button>

                          {/* Impersonate */}
                          <button
                            type="button"
                            onClick={() => void handleImpersonate(tenant.slug)}
                            title="Acceder como admin"
                            className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>

                          {/* Invite user */}
                          <button
                            type="button"
                            onClick={() => setInviteTarget({ slug: tenant.slug, name: tenant.name })}
                            title="Invitar usuario"
                            className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            <Users className="w-4 h-4" />
                          </button>

                          {/* Purge data */}
                          <button
                            type="button"
                            disabled={actionLoading === `${tenant.slug}-purge`}
                            onClick={() => void handlePurgeTenant(tenant.slug, tenant.name)}
                            title="Limpiar datos de esta tienda"
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-40"
                          >
                            {actionLoading === `${tenant.slug}-purge` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Eraser className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            disabled={actionLoading === `${tenant.slug}-delete` || tenant.slug === "main"}
                            onClick={() => setDeleteTarget({ slug: tenant.slug, name: tenant.name })}
                            title={tenant.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                          >
                            {actionLoading === `${tenant.slug}-delete` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </>)} {/* end pageTab === "tiendas" */}

      {/* ─── Growth / Crecimiento Tab ───────────────────────────────────────── */}
      {pageTab === "crecimiento" && (
        <div className="space-y-6">
          {growthLoading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos de crecimiento…
            </div>
          ) : growthData.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No hay datos de crecimiento
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Tiendas activas", value: growthData.length, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
                  { label: "Ingresos totales/mes", value: `S/${growthData.reduce((s, g) => s + (g.months[g.months.length - 1]?.revenue ?? 0), 0).toFixed(0)}`, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
                  { label: "Pedidos totales/mes", value: growthData.reduce((s, g) => s + (g.months[g.months.length - 1]?.orders ?? 0), 0), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
                  { label: "Crecimiento promedio", value: `${(growthData.reduce((s, g) => s + g.growthPct, 0) / (growthData.length || 1)).toFixed(0)}%`, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-2xl p-4 text-center`}>
                    <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
                    <div className="text-gray-500 text-xs mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Per-store growth cards */}
              <div className="space-y-4">
                {growthData.map((store) => {
                  const lastMonth = store.months[store.months.length - 1];
                  const prevMonth = store.months[store.months.length - 2];
                  const maxRevenue = Math.max(...store.months.map((m) => m.revenue), 1);
                  return (
                    <div key={store.slug} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">{store.name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white">{store.name}</div>
                            <div className="text-xs text-gray-400 font-mono">{store.slug}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${store.growthPct > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : store.growthPct < 0 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                            {store.growthPct > 0 ? <ArrowUpRight className="w-3 h-3" /> : store.growthPct < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                            {store.growthPct > 0 ? "+" : ""}{store.growthPct}%
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-gray-900 dark:text-white">S/{(lastMonth?.revenue ?? 0).toFixed(0)}</div>
                            <div className="text-[10px] text-gray-400">{lastMonth?.orders ?? 0} pedidos</div>
                          </div>
                        </div>
                      </div>

                      {/* Mini bar chart — 6 months */}
                      <div className="flex items-end gap-1.5 h-16">
                        {store.months.map((m, i) => (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className={`w-full rounded-t-md transition-all ${i === store.months.length - 1 ? "bg-teal-500" : "bg-gray-200 dark:bg-gray-700"}`}
                              style={{ height: `${Math.max(4, (m.revenue / maxRevenue) * 100)}%` }}
                              title={`${m.month}: S/${m.revenue.toFixed(0)} (${m.orders} pedidos)`}
                            />
                            <span className="text-[8px] text-gray-400 leading-none">{m.month}</span>
                          </div>
                        ))}
                      </div>

                      {/* Monthly detail row */}
                      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="text-center">
                          <div className="text-xs font-bold text-gray-900 dark:text-white">S/{store.totalRevenue.toFixed(0)}</div>
                          <div className="text-[9px] text-gray-400">Ingresos 6 meses</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold text-gray-900 dark:text-white">{store.totalOrders}</div>
                          <div className="text-[9px] text-gray-400">Pedidos 6 meses</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold text-gray-900 dark:text-white">S/{store.totalOrders > 0 ? (store.totalRevenue / store.totalOrders).toFixed(0) : "0"}</div>
                          <div className="text-[9px] text-gray-400">Ticket promedio</div>
                        </div>
                      </div>

                      {/* Projection */}
                      {lastMonth && prevMonth && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                          <span className="text-gray-500">
                            Proyección próximo mes: <span className="font-bold text-gray-900 dark:text-white">
                              S/{Math.max(0, lastMonth.revenue + (lastMonth.revenue - prevMonth.revenue)).toFixed(0)}
                            </span>
                            {" "}({Math.max(0, lastMonth.orders + (lastMonth.orders - prevMonth.orders))} pedidos)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${toast.ok ? "bg-teal-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Invite modal */}
      {inviteTarget && (
        <InviteModal
          tenantSlug={inviteTarget.slug}
          tenantName={inviteTarget.name}
          onClose={() => setInviteTarget(null)}
        />
      )}

      {/* Detail modal */}
      {detailTarget && (
        <TenantDetailModal
          tenant={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          slug={deleteTarget.slug}
          loading={actionLoading === `${deleteTarget.slug}-delete`}
          onConfirm={() => void handleDeleteTenant(deleteTarget.slug, deleteTarget.name)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Nuclear reset modal */}
      {nuclearResetOpen && (
        <NuclearResetModal
          loading={nuclearResetLoading}
          onConfirm={() => void handleNuclearReset()}
          onCancel={() => setNuclearResetOpen(false)}
        />
      )}
    </div>
  );
}
