"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, LogOut, RefreshCw, Users, Building2,
  CheckCircle2, XCircle, Crown, Zap, ShoppingBag, Loader2,
  TrendingUp, AlertTriangle, Search, ChevronDown, Mail, Copy, X,
  BarChart3, Activity, DollarSign, Clock, Eye, ArrowUpRight, ArrowDownRight,
  Calendar, Globe, Package,
} from "lucide-react";
import dynamic from "next/dynamic";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "business" | "enterprise";

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

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<PlanId, { label: string; color: string; icon: React.ReactNode }> = {
  free:     { label: "Free",     color: "bg-gray-800 text-gray-300",   icon: <ShoppingBag className="w-3 h-3" /> },
  pro:      { label: "Pro",      color: "bg-indigo-900 text-indigo-300", icon: <Zap className="w-3 h-3" /> },
  business: { label: "Business", color: "bg-amber-900 text-amber-300", icon: <Crown className="w-3 h-3" /> },
  enterprise: { label: "Enterprise", color: "bg-violet-900 text-violet-300", icon: <Crown className="w-3 h-3" /> },
};

// ─── Helper components ────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: PlanId }) {
  const cfg = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">{icon}{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function MiniUsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const color = unlimited ? "bg-gray-600" : pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-indigo-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{label}</span>
        <span className={pct >= 100 ? "text-red-400" : pct >= 80 ? "text-amber-400" : ""}>
          {unlimited ? "\u221e" : `${used}/${max}`}
        </span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-24">
        {!unlimited && <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />}
        {unlimited && <div className="h-full bg-gray-600 rounded-full w-full opacity-30" />}
      </div>
    </div>
  );
}

// ─── Invite Modal ────────────────────────────────────────────────────────────────

function InviteModal({
  tenantSlug,
  tenantName,
  onClose,
}: {
  tenantSlug: string;
  tenantName: string;
  onClose: () => void;
}) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Invitar usuario</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              <span className="text-gray-300">{tenantName}</span>{" "}
              <span className="font-mono">({tenantSlug})</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!inviteUrl ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email del invitado</label>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="admin">Administrador</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              onClick={handleSend} disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Generar enlace de invitación
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Enlace generado. Compártelo con el invitado.
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-xs font-mono text-gray-300 break-all">
              {inviteUrl}
            </div>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <p className="text-gray-600 text-xs text-center">El enlace expira en 72 horas.</p>
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

  const fmtD = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              {t.name}
            </h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{t.slug}</p>
            {t.ownerEmail && <p className="text-gray-400 text-xs mt-0.5">{t.ownerEmail}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={t.plan} />
            {t.active ? (
              <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Activa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                <XCircle className="w-3.5 h-3.5" /> Suspendida
              </span>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{t._count.AdminUser}</div>
            <div className="text-gray-500 text-[10px] mt-0.5">Usuarios</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{t.usage?.products ?? 0}</div>
            <div className="text-gray-500 text-[10px] mt-0.5">Productos</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{t.usage?.ordersThisMonth ?? 0}</div>
            <div className="text-gray-500 text-[10px] mt-0.5">Pedidos/mes</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{fmtD(t.createdAt)}</div>
            <div className="text-gray-500 text-[10px] mt-0.5">Creada</div>
          </div>
        </div>

        {/* Usage bars */}
        {t.usage && t.limits && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">Uso del plan</h3>
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
                    <span className="text-gray-300">{label}</span>
                    <span className={full ? "text-red-400 font-bold" : warn ? "text-amber-400" : "text-gray-500"}>
                      {used.toLocaleString("es-PE")} / {unlimited(max)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    {max === -1 ? (
                      <div className="h-full bg-gray-600/30 rounded-full w-full" />
                    ) : (
                      <div
                        className={`h-full rounded-full transition-all ${full ? "bg-red-500" : warn ? "bg-amber-400" : "bg-indigo-500"}`}
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
          <h3 className="text-sm font-semibold text-gray-400">Facturación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-500">Stripe Customer</span>
              <p className="text-gray-300 font-mono truncate">{t.stripeCustomerId ?? "—"}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-500">Subscription</span>
              <p className="text-gray-300 font-mono truncate">{t.stripeSubscriptionId ?? "—"}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-500">Periodo actual vence</span>
              <p className="text-gray-300">{fmtD(t.stripeCurrentPeriodEnd)}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-500">Trial termina</span>
              <p className="text-gray-300">{fmtD(t.trialEndsAt)}</p>
            </div>
          </div>
          {t.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 text-orange-400 text-xs bg-orange-950/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Esta tienda cancelará su suscripción al final del periodo actual.
            </div>
          )}
        </div>

        {/* Custom domain */}
        {t.customDomain && (
          <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-500">Dominio personalizado</span>
            <p className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <Globe className="w-3.5 h-3.5" /> {t.customDomain}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const router = useRouter();
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
  const [activeTab, setActiveTab] = useState<"tenants" | "analytics" | "activity">("tenants");

  // Activity tab state
  const [activityLogs, setActivityLogs] = useState<{ id: string; action: string; entity: string; entityId: string | null; detail: string; user: string; tenantId: string; createdAt: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityAction, setActivityAction] = useState("");
  const [activityTenant, setActivityTenant] = useState("");

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

  // ── Stats ──
  const total = tenants.length;
  const active = tenants.filter((t) => t.active).length;
  const paying = tenants.filter((t) => t.plan !== "free").length;
  const trial = tenants.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length;

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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white">Platform Admin</span>
              <span className="text-gray-500 text-xs ml-2">Bodega San Martín SaaS</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm hidden sm:block">{username}</span>
            <button
              onClick={() => loadTenants()}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={<Building2 className="w-4 h-4" />} label="Tiendas" value={total} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label="Activas" value={active} sub={`${total - active} suspendidas`} />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-indigo-400" />} label="De pago" value={paying} sub={`${total - paying} en free`} />
          <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label="En trial" value={trial} />
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {([
            { id: "tenants", label: "Tiendas", icon: <Building2 className="w-4 h-4" /> },
            { id: "analytics", label: "Analytics & Revenue", icon: <BarChart3 className="w-4 h-4" /> },
            { id: "activity", label: "Actividad", icon: <Activity className="w-4 h-4" /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════ ANALYTICS TAB ═══════ */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Recharts-powered analytics from API (MRR, ARR, ARPU, growth, revenue trend, signups, plan distribution) */}
            <RevenueCharts />

            {/* Usage summary (from tenant data) */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-400" /> Resumen de Uso Agregado
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {tenants.reduce((s, t) => s + (t.usage?.products ?? 0), 0).toLocaleString("es-PE")}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">Productos activos total</div>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {tenants.reduce((s, t) => s + (t.usage?.users ?? 0), 0).toLocaleString("es-PE")}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">Usuarios admin total</div>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {tenants.reduce((s, t) => s + (t.usage?.ordersThisMonth ?? 0), 0).toLocaleString("es-PE")}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">Pedidos este mes (total)</div>
                </div>
              </div>
            </div>

            {/* Top tenants by usage */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" /> Top Tiendas por Actividad
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Tienda</th>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-right px-4 py-3">Pedidos/mes</th>
                      <th className="text-right px-4 py-3">Productos</th>
                      <th className="text-right px-4 py-3">Usuarios</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {[...tenants]
                      .sort((a, b) => (b.usage?.ordersThisMonth ?? 0) - (a.usage?.ordersThisMonth ?? 0))
                      .slice(0, 10)
                      .map((t, i) => (
                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{t.name}</div>
                            <div className="text-gray-500 text-xs font-mono">{t.slug}</div>
                          </td>
                          <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                          <td className="px-4 py-3 text-right font-semibold text-white">{t.usage?.ordersThisMonth ?? 0}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{t.usage?.products ?? 0}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{t.usage?.users ?? 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* At-risk tenants */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Tiendas en Riesgo
              </h3>
              <p className="text-gray-500 text-xs mb-4">Tiendas que cancelarán pronto, tienen trial vencido, o están suspendidas</p>
              <div className="space-y-2">
                {tenants
                  .filter(t => t.cancelAtPeriodEnd || !t.active || (t.trialEndsAt && new Date(t.trialEndsAt) < new Date()))
                  .map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="text-white font-semibold text-sm">{t.name}</span>
                          <span className="text-gray-500 text-xs ml-2 font-mono">{t.slug}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <PlanBadge plan={t.plan} />
                        {t.cancelAtPeriodEnd && (
                          <span className="text-orange-400 text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Cancela pronto
                          </span>
                        )}
                        {!t.active && (
                          <span className="text-red-400 text-xs flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Suspendida
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                {tenants.filter(t => t.cancelAtPeriodEnd || !t.active || (t.trialEndsAt && new Date(t.trialEndsAt) < new Date())).length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-6">No hay tiendas en riesgo 🎉</p>
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={activityTenant}
                  onChange={(e) => setActivityTenant(e.target.value)}
                  placeholder="Filtrar por tenant ID…"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="relative">
                <select
                  value={activityAction}
                  onChange={(e) => setActivityAction(e.target.value)}
                  className="appearance-none bg-gray-900 border border-gray-800 text-gray-300 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
              <span className="text-gray-500 text-xs self-center">{activityTotal} registros</span>
            </div>

            {/* Activity log list */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {activityLoading ? (
                <div className="flex items-center justify-center gap-3 py-20 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" /> Cargando actividad…
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  No hay registros de actividad
                </div>
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-800/40 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">{log.action}</span>
                          <span className="text-gray-500 text-xs">·</span>
                          <span className="text-gray-400 text-xs">{log.entity}</span>
                          {log.entityId && <span className="text-gray-600 text-xs font-mono truncate max-w-32">{log.entityId}</span>}
                        </div>
                        {log.detail && <p className="text-gray-500 text-xs mt-0.5 truncate">{log.detail}</p>}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
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
                  onClick={() => loadActivity(activityPage - 1)}
                  disabled={activityPage <= 1 || activityLoading}
                  className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  ← Anterior
                </button>
                <span className="text-gray-400 text-sm">
                  Página {activityPage} de {activityPages}
                </span>
                <button
                  onClick={() => loadActivity(activityPage + 1)}
                  disabled={activityPage >= activityPages || activityLoading}
                  className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            )}

            {/* Still show domains & Stripe sections from tenant data */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" /> Dominios Personalizados
              </h3>
              <div className="space-y-2">
                {tenants
                  .filter(t => t.customDomain)
                  .map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        <div>
                          <span className="text-white font-semibold text-sm">{t.customDomain}</span>
                          <span className="text-gray-500 text-xs ml-3">{t.name}</span>
                        </div>
                      </div>
                      <PlanBadge plan={t.plan} />
                    </div>
                  ))}
                {tenants.filter(t => t.customDomain).length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-6">Ninguna tienda tiene dominio personalizado</p>
                )}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" /> Suscripciones Stripe Activas
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Tienda</th>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-left px-4 py-3">Customer ID</th>
                      <th className="text-left px-4 py-3">Vence</th>
                      <th className="text-left px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {tenants
                      .filter(t => t.stripeCustomerId)
                      .map(t => (
                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-white font-semibold">{t.name}</span>
                            <span className="text-gray-500 text-xs ml-2 font-mono">{t.slug}</span>
                          </td>
                          <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400">{t.stripeCustomerId}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(t.stripeCurrentPeriodEnd)}</td>
                          <td className="px-4 py-3">
                            {t.cancelAtPeriodEnd ? (
                              <span className="text-orange-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cancela</span>
                            ) : (
                              <span className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Activa</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {tenants.filter(t => t.stripeCustomerId).length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-8">No hay suscripciones Stripe activas</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ TENANTS TAB ═══════ */}
        {activeTab === "tenants" && (<>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por slug o nombre…"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="relative">
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value as typeof filterPlan)}
              className="appearance-none bg-gray-900 border border-gray-800 text-gray-300 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Todos los planes</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="appearance-none bg-gray-900 border border-gray-800 text-gray-300 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activas</option>
              <option value="inactive">Suspendidas</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Tenant table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="animate-pulse">
              {/* Skeleton table header */}
              <div className="border-b border-gray-800 px-5 py-3.5 flex gap-4">
                {[120, 60, 60, 80, 50, 80, 70, 80].map((w, i) => (
                  <div key={i} className="h-3 bg-gray-800 rounded" style={{ width: w }} />
                ))}
              </div>
              {/* Skeleton rows */}
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-800/50">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-800 rounded" />
                    <div className="h-3 w-20 bg-gray-800/60 rounded" />
                  </div>
                  <div className="h-5 w-14 bg-gray-800 rounded-full" />
                  <div className="h-4 w-16 bg-gray-800 rounded" />
                  <div className="h-4 w-20 bg-gray-800 rounded hidden md:block" />
                  <div className="h-4 w-10 bg-gray-800 rounded hidden lg:block" />
                  <div className="h-4 w-20 bg-gray-800 rounded hidden lg:block" />
                  <div className="h-7 w-20 bg-gray-800 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No hay tiendas con ese filtro
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
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
                <tbody className="divide-y divide-gray-800/50">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-800/40 transition-colors">
                      {/* Name / slug */}
                      <td className="px-5 py-4 cursor-pointer" onClick={() => setDetailTarget(t)}>
                        <div className="font-semibold text-white hover:text-indigo-400 transition-colors">{t.name}</div>
                        <div className="text-gray-500 text-xs mt-0.5 font-mono">{t.slug}</div>
                        {t.ownerEmail && (
                          <div className="text-gray-600 text-xs mt-0.5 truncate max-w-45">{t.ownerEmail}</div>
                        )}
                        {t.cancelAtPeriodEnd && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs text-orange-400">
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
                          <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                            <XCircle className="w-3.5 h-3.5" /> Suspendida
                          </span>
                        )}
                      </td>

                      {/* Trial / period end */}
                      <td className="px-4 py-4 hidden md:table-cell text-gray-400 text-xs">
                        {t.stripeCurrentPeriodEnd
                          ? <span title="Vence suscripción Stripe">🔄 {fmtDate(t.stripeCurrentPeriodEnd)}</span>
                          : t.trialEndsAt
                            ? <span title="Fin de trial">⏳ {fmtDate(t.trialEndsAt)}</span>
                            : <span className="text-gray-600">—</span>
                        }
                      </td>

                      {/* User count */}
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                          <Users className="w-3.5 h-3.5" /> {t._count.AdminUser}
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
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-4 hidden lg:table-cell text-gray-500 text-xs">
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
                              className="appearance-none bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                            >
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                              <option value="business">Business</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                            {actionLoading === `${t.slug}-plan` ? (
                              <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-400 pointer-events-none" />
                            ) : (
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                            )}
                          </div>

                          {/* Suspend / activate */}
                          <button
                            onClick={() => handleToggleActive(t.slug, t.active)}
                            disabled={actionLoading === `${t.slug}-active`}
                            title={t.active ? "Suspender" : "Activar"}
                            className={`p-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 ${
                              t.active
                                ? "border-red-800 text-red-400 hover:bg-red-950"
                                : "border-green-800 text-green-400 hover:bg-green-950"
                            }`}
                          >
                            {actionLoading === `${t.slug}-active` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : t.active ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Invite user */}
                          <button
                            onClick={() => setInviteTarget({ slug: t.slug, name: t.name })}
                            title="Invitar usuario"
                            className="p-1.5 rounded-lg border border-indigo-800 text-indigo-400 hover:bg-indigo-950 transition-colors"
                          >
                            <Mail className="w-3.5 h-3.5" />
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
            <div className="px-5 py-3 border-t border-gray-800 text-gray-500 text-xs">
              {filtered.length} de {total} tiendas
            </div>
          )}
        </div>
        </>)}
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            toast.ok ? "bg-green-900 text-green-200 border border-green-700" : "bg-red-900 text-red-200 border border-red-700"
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
