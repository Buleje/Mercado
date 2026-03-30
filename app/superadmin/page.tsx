"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, LogOut, RefreshCw, Users, Building2,
  CheckCircle2, XCircle, Crown, Zap, ShoppingBag, Loader2,
  TrendingUp, AlertTriangle, Search, ChevronDown, Mail, Copy, X,
  BarChart3, Activity, DollarSign, Clock,
  Globe, Package, Eye, EyeOff, KeyRound, RotateCcw,
  Sun, Moon, LayoutGrid, List, Settings, ExternalLink,
} from "lucide-react";
import dynamic from "next/dynamic";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "business" | "enterprise";
type TabId = "tenants" | "analytics" | "activity" | "settings";
type ViewMode = "table" | "cards";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: PlanId;
  trialEndsAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  customDomain: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  _count: { AdminUser: number };
  usage?: { products: number; users: number; ordersThisMonth: number };
  limits?: { maxProducts: number; maxUsers: number; maxOrdersPerMonth: number };
}

interface CommissionRow {
  id: string;
  orderId: string;
  storeId: string | null;
  partnerId: string | null;
  type: string;
  amount: number;
  rate: number;
  status: string;
  settledAt: string | null;
  createdAt: string;
}

interface PlatformSettings {
  priceFree: number;
  pricePro: number;
  priceBusiness: number;
  priceEnterprise: number;
  commissionDefault: number;
  limitsFreeProducts: number;
  limitsFreeUsers: number;
  limitsFreeOrders: number;
  limitsProProducts: number;
  limitsProUsers: number;
  limitsProOrders: number;
  allowNewStores: boolean;
  maintenanceMode: boolean;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  priceFree: 0,
  pricePro: 49,
  priceBusiness: 149,
  priceEnterprise: 499,
  commissionDefault: 2.5,
  limitsFreeProducts: 50,
  limitsFreeUsers: 2,
  limitsFreeOrders: 100,
  limitsProProducts: 500,
  limitsProUsers: 10,
  limitsProOrders: 1000,
  allowNewStores: true,
  maintenanceMode: false,
};

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<PlanId, { label: string; color: string; cardBg: string; icon: React.ReactNode }> = {
  free:       { label: "Free",       color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",    cardBg: "#6b7280", icon: <ShoppingBag className="w-3 h-3" /> },
  pro:        { label: "Pro",        color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",    cardBg: "#0f766e", icon: <Zap className="w-3 h-3" /> },
  business:   { label: "Business",   color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300", cardBg: "#7c3aed", icon: <Crown className="w-3 h-3" /> },
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",  cardBg: "#d97706", icon: <Crown className="w-3 h-3" /> },
};

// ─── Helper: Theme hook ───────────────────────────────────────────────────────
// `rerender-lazy-state-init` + `rendering-hydration-no-flicker`:
// Inicializa directo desde DOM (ya modificado por el script inline del layout)
// para evitar flash. Guard typeof window === "undefined" para SSR.

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  // Sincroniza si el layout no inyectó el script inline todavía
  useEffect(() => {
    const stored = localStorage.getItem("superadmin-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : prefersDark;
    if (isDark !== dark) {
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    // `rerender-functional-setstate`: setter funcional para estado estable
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("superadmin-theme", next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  return { dark, toggle };
}

// ─── Helper components ────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: PlanId }) {
  const cfg = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 overflow-hidden shadow-sm dark:shadow-none">
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      )}
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-3">{icon}{label}</div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-gray-400 dark:text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function MiniUsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const color = unlimited ? "bg-gray-400 dark:bg-gray-600" : pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-teal-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
        <span>{label}</span>
        <span className={pct >= 100 ? "text-red-400" : pct >= 80 ? "text-amber-400" : ""}>
          {unlimited ? "\u221e" : `${used}/${max}`}
        </span>
      </div>
      <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden w-24">
        {!unlimited && <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />}
        {unlimited && <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full w-full opacity-30" />}
      </div>
    </div>
  );
}

// ─── Impersonation Banner ─────────────────────────────────────────────────────

function ImpersonationBanner({ slug, onClear }: { slug: string; onClear: () => void }) {
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-3 py-2 px-4">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      Estás viendo como: <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded">{slug}</span>
      <button type="button" onClick={onClear} className="ml-2 underline hover:no-underline">
        Salir
      </button>
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({
  tenantSlug, tenantName, onClose,
}: { tenantSlug: string; tenantName: string; onClose: () => void }) {
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
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json() as { inviteUrl?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Error al crear invitación"); return; }
      setInviteUrl(data.inviteUrl ?? null);
    } catch {
      setError("Error de red");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Invitar usuario</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              <span className="text-gray-700 dark:text-gray-300">{tenantName}</span>{" "}
              <span className="font-mono">({tenantSlug})</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!inviteUrl ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email del invitado</label>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                >
                  <option value="admin">Administrador</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="button"
              onClick={handleSend} disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl disabled:opacity-50 text-white text-sm font-semibold transition-opacity"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Generar enlace de invitación
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Enlace generado. Compártelo con el invitado.
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
              {inviteUrl}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-semibold transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? "¡Copiado!" : "Copiar enlace"}
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
  const unlimited = (v: number) => v === -1 ? "∞" : v.toLocaleString("es-PE");
  const pct = (u: number, m: number) => m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
  const [showPassInfo, setShowPassInfo] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);

  const fmtD = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const handleCopyCredentials = () => {
    const text = [
      `Tenant: ${t.name} (${t.slug})`,
      `Email dueño: ${t.ownerEmail ?? "—"}`,
      `Plan: ${t.plan}`,
      `Estado: ${t.active ? "Activa" : "Suspendida"}`,
    ].join("\n");
    void navigator.clipboard.writeText(text);
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  };

  const handleResetPassword = async () => {
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/reset-password`, { method: "POST" });
      const data = await res.json() as { tempPassword?: string; error?: string };
      if (!res.ok) { setResetResult(`Error: ${data.error ?? "No se pudo resetear"}`); return; }
      setResetResult(data.tempPassword ? `Contraseña temporal: ${data.tempPassword}` : "Correo de reset enviado al dueño.");
    } catch {
      setResetResult("Error de red al intentar reset.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-teal-800/30 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-500" />
              {t.name}
            </h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
            {t.ownerEmail && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{t.ownerEmail}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={t.plan} />
            {t.active ? (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" /> Activa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-xs font-medium">
                <XCircle className="w-4 h-4" /> Suspendida
              </span>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: t._count.AdminUser, label: "Usuarios" },
            { value: t.usage?.products ?? 0, label: "Productos" },
            { value: t.usage?.ordersThisMonth ?? 0, label: "Pedidos/mes" },
            { value: fmtD(t.createdAt), label: "Creada" },
          ].map(({ value, label }) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Credenciales */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-500" /> Credenciales
          </h3>
          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Email del dueño</span>
                <p className="text-gray-700 dark:text-gray-200 mt-0.5">{t.ownerEmail ?? "—"}</p>
              </div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Slug / tenant ID</span>
                <p className="text-gray-700 dark:text-gray-200 mt-0.5 font-mono">{t.slug}</p>
              </div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Contraseña admin</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-gray-500">{showPassInfo ? "Contraseña encriptada — usar reset" : "••••••••"}</p>
                  <button
                    type="button"
                    onClick={() => setShowPassInfo((v) => !v)}
                    className="text-gray-400 hover:text-teal-500 transition-colors"
                    title={showPassInfo ? "Ocultar" : "Revelar"}
                  >
                    {showPassInfo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {t.stripeCustomerId && (
                <div>
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">API / Stripe ID</span>
                  <p className="text-gray-700 dark:text-gray-200 mt-0.5 font-mono truncate">{t.stripeCustomerId}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-xs font-semibold transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {credCopied ? "¡Copiado!" : "Copiar credenciales"}
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/70 border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {resetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Resetear contraseña
              </button>
            </div>

            {resetResult && (
              <div className="text-xs bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-700/40 text-teal-700 dark:text-teal-300 rounded-lg px-3 py-2 font-mono">
                {resetResult}
              </div>
            )}
          </div>
        </div>

        {/* Usage bars */}
        {t.usage && t.limits && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Uso del plan</h3>
            {([
              { label: "Productos", used: t.usage.products, max: t.limits.maxProducts },
              { label: "Usuarios", used: t.usage.users, max: t.limits.maxUsers },
              { label: "Pedidos/mes", used: t.usage.ordersThisMonth, max: t.limits.maxOrdersPerMonth },
            ] as const).map(({ label, used, max }) => {
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
                    {max === -1 ? (
                      <div className="h-full bg-gray-300 dark:bg-gray-600/30 rounded-full w-full" />
                    ) : (
                      <div
                        className={`h-full rounded-full transition-all ${full ? "bg-red-500" : warn ? "bg-amber-400" : "bg-teal-500"}`}
                        style={{ width: `${p}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Billing info */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Facturación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              { label: "Stripe Customer", value: t.stripeCustomerId ?? "—" },
              { label: "Subscription", value: t.stripeSubscriptionId ?? "—" },
              { label: "Periodo actual vence", value: fmtD(t.stripeCurrentPeriodEnd) },
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
              <AlertTriangle className="w-4 h-4" />
              Esta tienda cancelará su suscripción al final del periodo actual.
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

// ─── Tenant Card (cards view) ─────────────────────────────────────────────────

function TenantCard({
  tenant,
  onDetail,
  onInvite,
  onToggleActive,
  onPlanChange,
  actionLoading,
  onImpersonate,
}: {
  tenant: TenantRow;
  onDetail: (t: TenantRow) => void;
  onInvite: (slug: string, name: string) => void;
  onToggleActive: (slug: string, active: boolean) => void;
  onPlanChange: (slug: string, plan: PlanId) => void;
  actionLoading: string | null;
  onImpersonate: (slug: string) => void;
}) {
  const t = tenant;
  const cfg = PLAN_LABELS[t.plan];
  const initials = t.name.slice(0, 2).toUpperCase();
  const pct = (u: number, m: number) => m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
  const totalUsagePct = t.usage && t.limits
    ? Math.round((
        pct(t.usage.products, t.limits.maxProducts) +
        pct(t.usage.users, t.limits.maxUsers) +
        pct(t.usage.ordersThisMonth, t.limits.maxOrdersPerMonth)
      ) / 3)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none flex flex-col gap-4 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
          style={{ background: cfg.cardBg }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 dark:text-white truncate">{t.name}</div>
          <div className="text-gray-400 text-xs font-mono">{t.slug}</div>
        </div>
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${t.active ? "bg-green-500" : "bg-red-500"}`} title={t.active ? "Activa" : "Suspendida"} />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <PlanBadge plan={t.plan} />
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
          t.active
            ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
            : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
        }`}>
          {t.active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {t.active ? "Activa" : "Suspendida"}
        </span>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { val: t.usage?.products ?? 0, lbl: "Productos" },
          { val: t._count.AdminUser, lbl: "Usuarios" },
          { val: t.usage?.ordersThisMonth ?? 0, lbl: "Pedidos/mes" },
        ].map(({ val, lbl }) => (
          <div key={lbl} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl py-2">
            <div className="text-sm font-bold text-gray-900 dark:text-white">{val}</div>
            <div className="text-[10px] text-gray-400">{lbl}</div>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      {t.usage && t.limits && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Uso del plan</span>
            <span className={totalUsagePct >= 100 ? "text-red-500" : totalUsagePct >= 80 ? "text-amber-500" : "text-teal-500"}>
              {totalUsagePct}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalUsagePct >= 100 ? "bg-red-500" : totalUsagePct >= 80 ? "bg-amber-400" : "bg-teal-500"
              }`}
              style={{ width: `${totalUsagePct}%` }}
            />
          </div>
        </div>
      )}

      {/* Owner + date */}
      <div className="text-xs text-gray-400 space-y-0.5">
        {t.ownerEmail && <div className="truncate">{t.ownerEmail}</div>}
        <div>{new Date(t.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => onDetail(t)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" /> Ver detalle
        </button>
        <button
          type="button"
          onClick={() => onImpersonate(t.slug)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors"
          style={{ background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" }}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Ver panel admin
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onInvite(t.slug, t.name)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors"
        >
          <Mail className="w-3.5 h-3.5" /> Invitar
        </button>
        <button
          type="button"
          onClick={() => onToggleActive(t.slug, t.active)}
          disabled={actionLoading === `${t.slug}-active`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
            t.active
              ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
          }`}
        >
          {actionLoading === `${t.slug}-active`
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : t.active ? <><XCircle className="w-3.5 h-3.5" /> Suspender</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activar</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Settings Section ─────────────────────────────────────────────────────────

// `rerender-lazy-state-init`: la función inicializadora solo se ejecuta una vez,
// en la primera renderización — no en cada re-render. Segura en cliente (use client).
function SettingsSection() {
  const [settings, setSettings] = useState<PlatformSettings>(() => {
    // Este componente es "use client", así que window siempre existe en runtime.
    // El guard extra protege si Next.js evaluara el módulo en SSR por algún motivo.
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem("superadmin-platform-settings");
      if (!stored) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<PlatformSettings>) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem("superadmin-platform-settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputCls = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40";
  const labelCls = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider";

  return (
    <div className="space-y-6">
      {/* Precios de planes */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-teal-500" /> Precios de planes (S/ / mes)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            { key: "priceFree" as const, label: "Free" },
            { key: "pricePro" as const, label: "Pro" },
            { key: "priceBusiness" as const, label: "Business" },
            { key: "priceEnterprise" as const, label: "Enterprise" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                type="number" min={0}
                value={settings[key]}
                onChange={(e) => update(key, Number(e.target.value))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Comisión y límites */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-500" /> Comisión y límites
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelCls}>Comisión default (%)</label>
            <input
              type="number" min={0} max={100} step={0.1}
              value={settings.commissionDefault}
              onChange={(e) => update("commissionDefault", Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Límites plan Free</h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {([
            { key: "limitsFreeProducts" as const, label: "Productos" },
            { key: "limitsFreeUsers" as const, label: "Usuarios" },
            { key: "limitsFreeOrders" as const, label: "Pedidos/mes" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input type="number" min={0} value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className={inputCls} />
            </div>
          ))}
        </div>
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Límites plan Pro</h4>
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: "limitsProProducts" as const, label: "Productos" },
            { key: "limitsProUsers" as const, label: "Usuarios" },
            { key: "limitsProOrders" as const, label: "Pedidos/mes" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input type="number" min={0} value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className={inputCls} />
            </div>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-amber-500" /> Controles de plataforma
        </h3>
        <div className="space-y-4">
          {([
            { key: "allowNewStores" as const, label: "Permitir registro de nuevas tiendas", desc: "Si está desactivado, el formulario de registro estará cerrado" },
            { key: "maintenanceMode" as const, label: "Modo mantenimiento", desc: "Muestra una pantalla de mantenimiento a todos los usuarios" },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </div>
              <button
                type="button"
                onClick={() => update(key, !settings[key])}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                  settings[key] ? "bg-teal-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
                role="switch"
                aria-checked={settings[key]}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    settings[key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all"
          style={{ background: saved ? "#22c55e" : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" }}
        >
          {saved ? <><CheckCircle2 className="w-4 h-4" /> Guardado</> : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "tenants",   label: "Tiendas",       icon: <Building2 className="w-5 h-5" /> },
  { id: "analytics", label: "Analytics",     icon: <BarChart3 className="w-5 h-5" /> },
  { id: "activity",  label: "Actividad",     icon: <Activity className="w-5 h-5" /> },
  { id: "settings",  label: "Configuración", icon: <Settings className="w-5 h-5" /> },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<"all" | PlanId>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [detailTarget, setDetailTarget] = useState<TenantRow | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("tenants");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [impersonating, setImpersonating] = useState<string | null>(null);

  // Activity tab state
  const [activityLogs, setActivityLogs] = useState<{ id: string; action: string; entity: string; entityId: string | null; detail: string; user: string; tenantId: string; createdAt: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityAction, setActivityAction] = useState("");
  const [activityTenant, setActivityTenant] = useState("");

  // Commissions state
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [commLoading, setCommLoading] = useState(false);

  // Impersonation init
  useEffect(() => {
    const slug = localStorage.getItem("superadmin-impersonate-tenant");
    if (slug) setImpersonating(slug);
  }, []);

  const handleImpersonate = (slug: string) => {
    localStorage.setItem("superadmin-impersonate-tenant", slug);
    localStorage.setItem("active-tenant-slug", slug);
    setImpersonating(slug);
    // Abrir directamente el panel admin del tenant (guarda slug y redirige a /admin)
    window.open(`/t/${slug}/admin`, "_blank");
  };

  const clearImpersonation = () => {
    localStorage.removeItem("superadmin-impersonate-tenant");
    setImpersonating(null);
  };

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const [authRes, tenantsRes] = await Promise.all([
        fetch("/api/superadmin/auth"),
        fetch("/api/superadmin/tenants"),
      ]);
      if (!authRes.ok) { router.replace("/superadmin/login"); return; }
      const authData = await authRes.json() as { username?: string };
      setUsername(authData.username ?? "");
      if (!tenantsRes.ok) { showToast("Error al cargar tiendas", false); return; }
      const data = await tenantsRes.json() as { tenants: TenantRow[] };
      setTenants(data.tenants);
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const loadActivity = useCallback(async (page = 1) => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (activityAction) params.set("action", activityAction);
      if (activityTenant) params.set("tenant", activityTenant);
      const res = await fetch(`/api/superadmin/activity?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { logs: { id: string; action: string; entity: string; entityId: string | null; detail: string; user: string; tenantId: string; createdAt: string }[]; pagination: { page: number; pages: number; total: number } };
      setActivityLogs(data.logs);
      setActivityPage(data.pagination.page);
      setActivityPages(data.pagination.pages);
      setActivityTotal(data.pagination.total);
    } finally {
      setActivityLoading(false);
    }
  }, [activityAction, activityTenant]);

  useEffect(() => {
    if (activeTab === "activity") loadActivity(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activityAction, activityTenant]);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const res = await fetch("/api/superadmin/commissions?limit=20");
      if (!res.ok) return;
      const data = await res.json() as { commissions: CommissionRow[] };
      setCommissions(data.commissions ?? []);
    } finally {
      setCommLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "analytics") loadCommissions();
  }, [activeTab, loadCommissions]);

  const handleLogout = async () => {
    await fetch("/api/superadmin/auth", { method: "DELETE" });
    router.replace("/superadmin/login");
  };

  const handlePlanChange = async (slug: string, plan: PlanId) => {
    setActionLoading(`${slug}-plan`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { showToast("Error al cambiar plan", false); return; }
      setTenants((prev) => prev.map((t) => t.slug === slug ? { ...t, plan } : t));
      showToast(`Plan de ${slug} → ${plan}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (slug: string, current: boolean) => {
    setActionLoading(`${slug}-active`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !current }),
      });
      if (!res.ok) { showToast("Error al actualizar estado", false); return; }
      setTenants((prev) => prev.map((t) => t.slug === slug ? { ...t, active: !current } : t));
      showToast(`${slug} ${!current ? "activada" : "suspendida"}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteTenant = async (slug: string, name: string) => {
    const confirmed = window.confirm(
      `¿Eliminar permanentemente la tienda "${name}" (${slug})?\n\nEsta acción borrará TODOS sus datos: productos, pedidos, clientes, ventas, configuración y usuarios. No se puede deshacer.`
    );
    if (!confirmed) return;
    setActionLoading(`${slug}-delete`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/delete`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        showToast(err.error ?? "Error al eliminar la tienda", false);
        return;
      }
      setTenants((prev) => prev.filter((t) => t.slug !== slug));
      showToast(`Tienda "${name}" eliminada permanentemente`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Stats ──
  const total = tenants.length;
  const active = tenants.filter((t) => t.active).length;
  const paying = tenants.filter((t) => t.plan !== "free").length;
  const trial = tenants.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length;

  // ── Commission stats ──
  const commThisMonth = commissions.filter((c) => c.status !== "paid").reduce((s, c) => s + c.amount, 0);
  const commPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const commPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  // ── Filtering ──
  const filtered = tenants.filter((t) => {
    if (search && !t.slug.includes(search) && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPlan !== "all" && t.plan !== filterPlan) return false;
    if (filterActive === "active" && !t.active) return false;
    if (filterActive === "inactive" && t.active) return false;
    return true;
  });

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

  const fmtAmount = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  // shared input style
  const inputCls = "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40";
  const selectCls = `appearance-none ${inputCls} pr-8 text-gray-700 dark:text-gray-300 cursor-pointer`;

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col`}>
      {impersonating && (
        <ImpersonationBanner slug={impersonating} onClear={clearImpersonation} />
      )}

      {/* Header */}
      <header className={`border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 sm:px-6 py-4 sticky top-0 z-30 ${impersonating ? "mt-9" : ""}`}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" }}
            >
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-gray-900 dark:text-white">Buleje Platform</span>
              <span className="text-gray-400 text-xs ml-2">SuperAdmin</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-gray-400 text-sm hidden sm:block">{username}</span>
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              title={dark ? "Modo claro" : "Modo oscuro"}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => loadTenants()}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 max-w-screen-2xl w-full mx-auto">

        {/* Sidebar — desktop */}
        <aside className="hidden md:flex flex-col w-16 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-6 gap-2 items-center sticky top-[73px] self-start h-[calc(100vh-73px)]">
          {NAV_ITEMS.map((item) => (
            <div key={item.id} className="relative group">
              <button
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  activeTab === item.id
                    ? "text-white shadow-md"
                    : "text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                style={activeTab === item.id ? { background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" } : {}}
              >
                {item.icon}
              </button>
              {/* Tooltip */}
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg">
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 py-8 space-y-8 min-w-0">

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<Building2 className="w-4 h-4" />} label="Tiendas" value={total} accent="linear-gradient(90deg,#0f766e,#14b8a6)" />
            <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} label="Activas" value={active} sub={`${total - active} suspendidas`} accent="#22c55e" />
            <StatCard icon={<TrendingUp className="w-4 h-4 text-teal-500" />} label="De pago" value={paying} sub={`${total - paying} en free`} accent="linear-gradient(90deg,#0f766e,#14b8a6)" />
            <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label="En trial" value={trial} accent="#f59e0b" />
          </div>

          {/* Mobile tab bar */}
          <div className="flex md:hidden gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${
                  activeTab === item.id ? "text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                style={activeTab === item.id ? { background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" } : {}}
              >
                {item.icon}
              </button>
            ))}
          </div>

          {/* ═══════ ANALYTICS TAB ═══════ */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <RevenueCharts />

              {/* Comisiones */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-teal-500" /> Comisiones
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Comisiones del mes", value: commThisMonth, sub: "No liquidadas aún", accent: "linear-gradient(90deg,#0f766e,#14b8a6)", icon: <DollarSign className="w-3.5 h-3.5" /> },
                    { label: "Comisiones pagadas", value: commPaid, sub: "Status: paid", accent: "#22c55e", icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> },
                    { label: "Pendiente de liquidar", value: commPending, sub: "Status: pending", accent: "#f59e0b", icon: <Clock className="w-3.5 h-3.5 text-amber-400" /> },
                  ].map(({ label, value, sub, accent, icon }) => (
                    <div key={label} className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 overflow-hidden shadow-sm dark:shadow-none">
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: accent }} />
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-2 flex items-center gap-1.5">{icon} {label}</div>
                      {commLoading ? (
                        <div className="h-8 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded" />
                      ) : (
                        <div className="text-2xl font-bold text-gray-900 dark:text-white font-mono">{fmtAmount(value)}</div>
                      )}
                      <div className="text-gray-400 text-xs mt-1">{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Tabla comisiones */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Comisiones recientes</span>
                    <span className="text-xs text-gray-400">Últimas 20</span>
                  </div>
                  {commLoading ? (
                    <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
                    </div>
                  ) : commissions.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">Sin registros de comisiones</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                            <th className="text-left px-5 py-3">Orden</th>
                            <th className="text-left px-4 py-3">Tienda</th>
                            <th className="text-left px-4 py-3">Tipo</th>
                            <th className="text-right px-4 py-3">Monto</th>
                            <th className="text-right px-4 py-3">Tasa</th>
                            <th className="text-left px-4 py-3">Estado</th>
                            <th className="text-left px-4 py-3">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                          {commissions.map((c) => (
                            <tr key={c.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                              <td className="px-5 py-3 text-xs font-mono text-gray-400 truncate max-w-32">{c.orderId}</td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-400">{c.storeId ?? "—"}</td>
                              <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{c.type}</td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white font-mono">{fmtAmount(c.amount)}</td>
                              <td className="px-4 py-3 text-right text-xs text-gray-400">{(c.rate * 100).toFixed(1)}%</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  c.status === "paid"
                                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                                    : c.status === "pending"
                                      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(c.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage summary */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-500" /> Resumen de Uso Agregado
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { value: tenants.reduce((s, t) => s + (t.usage?.products ?? 0), 0), label: "Productos activos total" },
                    { value: tenants.reduce((s, t) => s + (t.usage?.users ?? 0), 0), label: "Usuarios admin total" },
                    { value: tenants.reduce((s, t) => s + (t.usage?.ordersThisMonth ?? 0), 0), label: "Pedidos este mes (total)" },
                  ].map(({ value, label }) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString("es-PE")}</div>
                      <div className="text-gray-400 text-xs mt-1">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top tenants */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-teal-500" /> Top Tiendas por Actividad
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">#</th>
                        <th className="text-left px-4 py-3">Tienda</th>
                        <th className="text-left px-4 py-3">Plan</th>
                        <th className="text-right px-4 py-3">Pedidos/mes</th>
                        <th className="text-right px-4 py-3">Productos</th>
                        <th className="text-right px-4 py-3">Usuarios</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                      {[...tenants]
                        .sort((a, b) => (b.usage?.ordersThisMonth ?? 0) - (a.usage?.ordersThisMonth ?? 0))
                        .slice(0, 10)
                        .map((t, i) => (
                          <tr key={t.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                            <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-gray-900 dark:text-white">{t.name}</div>
                              <div className="text-gray-400 text-xs font-mono">{t.slug}</div>
                            </td>
                            <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{t.usage?.ordersThisMonth ?? 0}</td>
                            <td className="px-4 py-3 text-right text-gray-400">{t.usage?.products ?? 0}</td>
                            <td className="px-4 py-3 text-right text-gray-400">{t.usage?.users ?? 0}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* At-risk tenants */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" /> Tiendas en Riesgo
                </h3>
                <p className="text-gray-400 text-xs mb-4">Tiendas que cancelarán pronto, tienen trial vencido, o están suspendidas</p>
                <div className="space-y-2">
                  {tenants
                    .filter(t => t.cancelAtPeriodEnd || !t.active || (t.trialEndsAt && new Date(t.trialEndsAt) < new Date()))
                    .map(t => (
                      <div key={t.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-gray-900 dark:text-white font-semibold text-sm">{t.name}</span>
                            <span className="text-gray-400 text-xs ml-2 font-mono">{t.slug}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <PlanBadge plan={t.plan} />
                          {t.cancelAtPeriodEnd && (
                            <span className="text-orange-500 dark:text-orange-400 text-xs flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Cancela pronto
                            </span>
                          )}
                          {!t.active && (
                            <span className="text-red-500 dark:text-red-400 text-xs flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Suspendida
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  {tenants.filter(t => t.cancelAtPeriodEnd || !t.active || (t.trialEndsAt && new Date(t.trialEndsAt) < new Date())).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-6">No hay tiendas en riesgo</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════ ACTIVITY TAB ═══════ */}
          {activeTab === "activity" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={activityTenant}
                    onChange={(e) => setActivityTenant(e.target.value)}
                    placeholder="Filtrar por tenant ID…"
                    className={`w-full ${inputCls} pl-9`}
                  />
                </div>
                <div className="relative">
                  <select
                    value={activityAction}
                    onChange={(e) => setActivityAction(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Todas las acciones</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="login">Login</option>
                    <option value="plan_change">Plan change</option>
                    <option value="suspend">Suspend</option>
                    <option value="activate">Activate</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <span className="text-gray-400 text-xs self-center">{activityTotal} registros</span>
              </div>

              {/* Activity log */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
                {activityLoading ? (
                  <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando actividad…
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    No hay registros de actividad
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-600/20 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0 mt-0.5">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-900 dark:text-white font-semibold text-sm">{log.action}</span>
                            <span className="text-gray-300 dark:text-gray-500 text-xs">·</span>
                            <span className="text-gray-500 text-xs">{log.entity}</span>
                            {log.entityId && <span className="text-gray-400 text-xs font-mono truncate max-w-32">{log.entityId}</span>}
                          </div>
                          {log.detail && <p className="text-gray-400 text-xs mt-0.5 truncate">{log.detail}</p>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{log.user}</span>
                            <span>·</span>
                            <span className="font-mono">{log.tenantId}</span>
                            <span>·</span>
                            <span>{new Date(log.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {activityPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadActivity(activityPage - 1)}
                    disabled={activityPage <= 1 || activityLoading}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-gray-400 text-sm">
                    Página {activityPage} de {activityPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadActivity(activityPage + 1)}
                    disabled={activityPage >= activityPages || activityLoading}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}

              {/* Custom domains */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-500" /> Dominios Personalizados
                </h3>
                <div className="space-y-2">
                  {tenants.filter(t => t.customDomain).map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Globe className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="text-gray-900 dark:text-white font-semibold text-sm">{t.customDomain}</span>
                          <span className="text-gray-400 text-xs ml-3">{t.name}</span>
                        </div>
                      </div>
                      <PlanBadge plan={t.plan} />
                    </div>
                  ))}
                  {tenants.filter(t => t.customDomain).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-6">Ninguna tienda tiene dominio personalizado</p>
                  )}
                </div>
              </div>

              {/* Stripe subscriptions */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-500" /> Suscripciones Stripe Activas
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">Tienda</th>
                        <th className="text-left px-4 py-3">Plan</th>
                        <th className="text-left px-4 py-3">Customer ID</th>
                        <th className="text-left px-4 py-3">Vence</th>
                        <th className="text-left px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                      {tenants.filter(t => t.stripeCustomerId).map(t => (
                        <tr key={t.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-gray-900 dark:text-white font-semibold">{t.name}</span>
                            <span className="text-gray-400 text-xs ml-2 font-mono">{t.slug}</span>
                          </td>
                          <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400">{t.stripeCustomerId}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(t.stripeCurrentPeriodEnd)}</td>
                          <td className="px-4 py-3">
                            {t.cancelAtPeriodEnd ? (
                              <span className="text-orange-500 dark:text-orange-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cancela</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Activa</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tenants.filter(t => t.stripeCustomerId).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">No hay suscripciones Stripe activas</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════ SETTINGS TAB ═══════ */}
          {activeTab === "settings" && <SettingsSection />}

          {/* ═══════ TENANTS TAB ═══════ */}
          {activeTab === "tenants" && (
            <>
              {/* Filters + view toggle */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por slug o nombre…"
                    className={`w-full ${inputCls} pl-9`}
                  />
                </div>
                <div className="relative">
                  <select
                    value={filterPlan}
                    onChange={(e) => setFilterPlan(e.target.value as typeof filterPlan)}
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
                    onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
                    className={selectCls}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activas</option>
                    <option value="inactive">Suspendidas</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    title="Vista tabla"
                    className={`p-2 rounded-lg transition-all ${viewMode === "table" ? "text-white" : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`}
                    style={viewMode === "table" ? { background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" } : {}}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    title="Vista cards"
                    className={`p-2 rounded-lg transition-all ${viewMode === "cards" ? "text-white" : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`}
                    style={viewMode === "cards" ? { background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" } : {}}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cards view */}
              {viewMode === "cards" && (
                <>
                  {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 animate-pulse space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800" />
                            <div className="space-y-2 flex-1">
                              <div className="h-4 w-28 bg-gray-100 dark:bg-gray-800 rounded" />
                              <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
                            </div>
                          </div>
                          <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                          <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                      <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      No hay tiendas con ese filtro
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filtered.map((t) => (
                        <TenantCard
                          key={t.id}
                          tenant={t}
                          onDetail={setDetailTarget}
                          onInvite={(slug, name) => setInviteTarget({ slug, name })}
                          onToggleActive={handleToggleActive}
                          onPlanChange={handlePlanChange}
                          actionLoading={actionLoading}
                          onImpersonate={handleImpersonate}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Table view */}
              {viewMode === "table" && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
                  {loading ? (
                    <div className="animate-pulse">
                      <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5 flex gap-4">
                        {[120, 60, 60, 80, 50, 80, 70, 80].map((w, i) => (
                          <div key={i} className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: w }} />
                        ))}
                      </div>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100/50 dark:border-gray-800/50">
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded" />
                            <div className="h-3 w-20 bg-gray-100/60 dark:bg-gray-800/60 rounded" />
                          </div>
                          <div className="h-5 w-14 bg-gray-100 dark:bg-gray-800 rounded-full" />
                          <div className="h-4 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
                          <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 rounded hidden md:block" />
                          <div className="h-4 w-10 bg-gray-100 dark:bg-gray-800 rounded hidden lg:block" />
                          <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 rounded hidden lg:block" />
                          <div className="h-7 w-20 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                      <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      No hay tiendas con ese filtro
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                            <th className="text-left px-5 py-3.5">Tienda</th>
                            <th className="text-left px-4 py-3.5">Plan</th>
                            <th className="text-left px-4 py-3.5">Estado</th>
                            <th className="text-left px-4 py-3.5 hidden md:table-cell">Trial / Vence</th>
                            <th className="text-left px-4 py-3.5 hidden lg:table-cell">Usuarios</th>
                            <th className="text-left px-4 py-3.5 hidden xl:table-cell">Uso del plan</th>
                            <th className="text-left px-4 py-3.5 hidden lg:table-cell">Creada</th>
                            <th className="text-left px-4 py-3.5">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                          {filtered.map((t) => (
                            <tr key={t.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors">
                              {/* Name / slug */}
                              <td className="px-5 py-4 cursor-pointer" onClick={() => setDetailTarget(t)}>
                                <div className="font-semibold text-gray-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors">{t.name}</div>
                                <div className="text-gray-400 text-xs mt-0.5 font-mono">{t.slug}</div>
                                {t.ownerEmail && (
                                  <div className="text-gray-400 text-xs mt-0.5 truncate max-w-45">{t.ownerEmail}</div>
                                )}
                                {t.cancelAtPeriodEnd && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-orange-500 dark:text-orange-400">
                                    <AlertTriangle className="w-3 h-3" /> Cancela al vencer
                                  </span>
                                )}
                              </td>

                              {/* Plan */}
                              <td className="px-4 py-4">
                                <PlanBadge plan={t.plan} />
                              </td>

                              {/* Active */}
                              <td className="px-4 py-4">
                                {t.active ? (
                                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                                    <CheckCircle2 className="w-4 h-4" /> Activa
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-xs font-medium">
                                    <XCircle className="w-4 h-4" /> Suspendida
                                  </span>
                                )}
                              </td>

                              {/* Trial / period end */}
                              <td className="px-4 py-4 hidden md:table-cell text-gray-400 text-xs">
                                {t.stripeCurrentPeriodEnd
                                  ? <span title="Vence suscripción Stripe">🔄 {fmtDate(t.stripeCurrentPeriodEnd)}</span>
                                  : t.trialEndsAt
                                    ? <span title="Fin de trial">⏳ {fmtDate(t.trialEndsAt)}</span>
                                    : <span className="text-gray-300 dark:text-gray-600">—</span>
                                }
                              </td>

                              {/* User count */}
                              <td className="px-4 py-4 hidden lg:table-cell">
                                <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                                  <Users className="w-4 h-4" /> {t._count.AdminUser}
                                </span>
                              </td>

                              {/* Usage bars */}
                              <td className="px-4 py-4 hidden xl:table-cell">
                                {t.usage && t.limits ? (
                                  <div className="space-y-1.5">
                                    <MiniUsageBar used={t.usage.products} max={t.limits.maxProducts} label="Prod" />
                                    <MiniUsageBar used={t.usage.users} max={t.limits.maxUsers} label="Users" />
                                    <MiniUsageBar used={t.usage.ordersThisMonth} max={t.limits.maxOrdersPerMonth} label="Pedidos" />
                                  </div>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                )}
                              </td>

                              {/* Created */}
                              <td className="px-4 py-4 hidden lg:table-cell text-gray-400 text-xs">
                                {fmtDate(t.createdAt)}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  {/* Plan selector */}
                                  <div className="relative">
                                    <select
                                      value={t.plan}
                                      onChange={(e) => handlePlanChange(t.slug, e.target.value as PlanId)}
                                      disabled={actionLoading === `${t.slug}-plan`}
                                      className="appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500/40 cursor-pointer disabled:opacity-50"
                                    >
                                      <option value="free">Free</option>
                                      <option value="pro">Pro</option>
                                      <option value="business">Business</option>
                                      <option value="enterprise">Enterprise</option>
                                    </select>
                                    {actionLoading === `${t.slug}-plan` ? (
                                      <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-400 pointer-events-none" />
                                    ) : (
                                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                    )}
                                  </div>

                                  {/* Impersonate */}
                                  <button
                                    type="button"
                                    onClick={() => handleImpersonate(t.slug)}
                                    title="Entrar como admin"
                                    className="p-1.5 rounded-lg border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </button>

                                  {/* Suspend / activate */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(t.slug, t.active)}
                                    disabled={actionLoading === `${t.slug}-active`}
                                    title={t.active ? "Suspender" : "Activar"}
                                    className={`p-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 ${
                                      t.active
                                        ? "border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                                        : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                                    }`}
                                  >
                                    {actionLoading === `${t.slug}-active` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : t.active ? (
                                      <XCircle className="w-4 h-4" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4" />
                                    )}
                                  </button>

                                  {/* Invite user */}
                                  <button
                                    type="button"
                                    onClick={() => setInviteTarget({ slug: t.slug, name: t.name })}
                                    title="Invitar usuario"
                                    className="p-1.5 rounded-lg border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors"
                                  >
                                    <Mail className="w-4 h-4" />
                                  </button>

                                  {/* Eliminar tienda */}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTenant(t.slug, t.name)}
                                    disabled={actionLoading === `${t.slug}-delete`}
                                    title="Eliminar tienda permanentemente"
                                    className="p-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === `${t.slug}-delete` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <X className="w-4 h-4" />
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

                  {/* Table footer */}
                  {!loading && filtered.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-gray-400 text-xs">
                      {filtered.length} de {total} tiendas
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            toast.ok
              ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-700"
              : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-700"
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
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

      {/* Tenant detail modal */}
      {detailTarget && (
        <TenantDetailModal
          tenant={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
