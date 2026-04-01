"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Building2, ChevronDown, ExternalLink,
  RefreshCw, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = "name" | "plan" | "createdAt" | "ordersThisMonth";
type SortDir = "asc" | "desc";

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
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<PlanId | "">("");
  const [filterActive, setFilterActive] = useState<"" | "active" | "suspended">("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/tenants", { credentials: "include" });
      if (!res.ok) { setError("Error al cargar tenants"); return; }
      const data = await res.json() as { tenants: TenantRow[] };
      setTenants(data.tenants);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  const handleToggleActive = async (tenant: TenantRow) => {
    setTogglingSlug(tenant.slug);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tenant.active }),
      });
      if (res.ok) {
        setTenants((prev) =>
          prev.map((t) => t.slug === tenant.slug ? { ...t, active: !t.active } : t),
        );
      }
    } finally {
      setTogglingSlug(null);
    }
  };

  const handlePlanChanged = (slug: string, newPlan: PlanId) => {
    setTenants((prev) =>
      prev.map((t) => t.slug === slug ? { ...t, plan: newPlan } : t),
    );
  };

  // Filter + search
  const filtered = tenants.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q) && !(t.ownerEmail ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterPlan && t.plan !== filterPlan) return false;
    if (filterActive === "active" && !t.active) return false;
    if (filterActive === "suspended" && t.active) return false;
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
        <button
          type="button"
          onClick={() => void loadTenants()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Filters */}
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
            onChange={(e) => setFilterPlan(e.target.value as PlanId | "")}
            className={selectCls}
          >
            <option value="">Todos los planes</option>
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
            onChange={(e) => setFilterActive(e.target.value as "" | "active" | "suspended")}
            className={selectCls}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="suspended">Suspendidas</option>
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

      {/* Table */}
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
                      <div className="font-semibold text-gray-900 dark:text-white">{tenant.name}</div>
                      <div className="text-xs font-mono text-gray-400 mt-0.5">{tenant.slug}</div>
                      {tenant.ownerEmail && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-48">{tenant.ownerEmail}</div>
                      )}
                    </td>

                    {/* Plan (editable) */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <PlanBadge plan={tenant.plan} />
                        <PlanSelect
                          slug={tenant.slug}
                          current={tenant.plan}
                          onChanged={(p) => handlePlanChanged(tenant.slug, p)}
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
                      <div className="flex items-center justify-center gap-2">
                        {/* Toggle active */}
                        <button
                          type="button"
                          disabled={togglingSlug === tenant.slug}
                          onClick={() => void handleToggleActive(tenant)}
                          title={tenant.active ? "Suspender tienda" : "Activar tienda"}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                            tenant.active
                              ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                              : "text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30"
                          }`}
                        >
                          {togglingSlug === tenant.slug ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : tenant.active ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </button>

                        {/* Open store */}
                        <a
                          href={`/${tenant.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir tienda"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
