"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Search, ChevronDown, RefreshCw,
  CheckCircle2, XCircle, LayoutGrid, List, Bomb,
} from "lucide-react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

import { TenantCard } from "@/components/superadmin/tenants/TenantCard";
import { TenantTable } from "@/components/superadmin/tenants/TenantTable";
import { TenantGrowthTab } from "@/components/superadmin/tenants/TenantGrowthTab";
import { TenantProductsModal } from "@/components/superadmin/tenants/TenantProductsModal";
import { InviteModal } from "@/components/superadmin/tenants/InviteModal";
import { TenantDetailModal } from "@/components/superadmin/tenants/TenantDetailModal";
import { DeleteConfirmModal } from "@/components/superadmin/tenants/DeleteConfirmModal";
import { NuclearResetModal } from "@/components/superadmin/tenants/NuclearResetModal";
import { useTenantActions } from "@/components/superadmin/tenants/useTenantActions";
import type { SortField, SortDir, ViewMode, GrowthEntry } from "@/components/superadmin/tenants/types";

const inputCls =
  "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40";
const selectCls = `appearance-none ${inputCls} pr-8 text-[var(--text-secondary)] cursor-pointer`;

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
  const [productsTarget, setProductsTarget] = useState<{ slug: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [nuclearResetOpen, setNuclearResetOpen] = useState(false);
  const [nuclearResetLoading, setNuclearResetLoading] = useState(false);
  const [growthData, setGrowthData] = useState<GrowthEntry[]>([]);
  const [growthLoading, setGrowthLoading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadTenants = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants");
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
      const res = await fetchSuperadmin("/api/superadmin/tenants/growth");
      if (res.ok) {
        const json = await res.json() as { data: GrowthEntry[] };
        setGrowthData(json.data);
      }
    } catch { /* silent */ }
    finally { setGrowthLoading(false); }
  }, []);

  useEffect(() => {
    if (pageTab === "crecimiento" && growthData.length === 0) void loadGrowth();
  }, [pageTab, growthData.length, loadGrowth]);

  const {
    handleToggleActive,
    handlePlanChange,
    handleDeleteTenant,
    handleNuclearReset,
    handlePurgeTenant,
    handleImpersonate,
    handleToggleMarketplace,
    handleLoginAs,
  } = useTenantActions({
    setTenants,
    setActionLoading,
    setNuclearResetOpen,
    setNuclearResetLoading,
    setDeleteTarget,
    showToast,
    loadTenants,
  });

  const filtered = tenants.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q) && !(t.ownerEmail ?? "").toLowerCase().includes(q)) return false;
    }
    if (filterPlan !== "all" && t.plan !== filterPlan) return false;
    if (filterActive === "active" && !t.active) return false;
    if (filterActive === "inactive" && t.active) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = a.name.localeCompare(b.name);
    else if (sortField === "plan") cmp = a.plan.localeCompare(b.plan);
    else if (sortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    else if (sortField === "ordersThisMonth") cmp = (a.usage?.ordersThisMonth ?? 0) - (b.usage?.ordersThisMonth ?? 0);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-500" /> Tenants
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {sorted.length} tienda{sorted.length !== 1 ? "s" : ""}
            {tenants.length !== sorted.length ? ` de ${tenants.length}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--surface-sunken)] rounded-xl p-1 mr-2">
            {(["tiendas", "crecimiento"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setPageTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pageTab === tab ? "bg-white dark:bg-gray-700 text-[var(--accent)] shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}>
                {tab === "tiendas" ? "Tiendas" : "Crecimiento"}
              </button>
            ))}
          </div>
          {pageTab === "tiendas" && (
            <div className="flex items-center bg-[var(--surface-sunken)] rounded-xl p-1">
              <button type="button" onClick={() => setViewMode("table")} title="Vista tabla"
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-white dark:bg-gray-700 text-[var(--accent)] shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}>
                <List className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setViewMode("cards")} title="Vista tarjetas"
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "cards" ? "bg-white dark:bg-gray-700 text-[var(--accent)] shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          )}
          <button type="button" onClick={() => void loadTenants()} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] text-sm hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
          {/* Ola 2: trigger neutro; confirm modal (NuclearResetModal) mantiene danger sólido */}
          <button type="button" onClick={() => setNuclearResetOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] bg-transparent text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
            title="Borrar todos los datos del sistema">
            <Bomb className="w-4 h-4 text-[var(--text-secondary)]" /> Limpiar datos
          </button>
        </div>
      </div>

      {/* Tab: Tiendas */}
      {pageTab === "tiendas" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, slug o email…" className={`w-full ${inputCls} pl-9`} />
            </div>
            <div className="relative">
              <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value as "all" | PlanId)} className={selectCls}>
                <option value="all">Todos los planes</option>
                <option value="free">Free</option><option value="pro">Pro</option>
                <option value="business">Business</option><option value="enterprise">Enterprise</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")} className={selectCls}>
                <option value="all">Todos los estados</option>
                <option value="active">Activas</option><option value="inactive">Suspendidas</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {error && (
            <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] rounded-xl px-4 py-3 text-sm flex items-center justify-between">
              {error}
              <button type="button" onClick={() => void loadTenants()} className="underline hover:no-underline text-xs">Reintentar</button>
            </div>
          )}

          {!loading && viewMode === "cards" && (
            sorted.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" /> No hay tenants
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {sorted.map((tenant) => (
                  <TenantCard key={tenant.id} tenant={tenant}
                    onDetail={(t) => setDetailTarget(t)}
                    onInvite={(slug, name) => setInviteTarget({ slug, name })}
                    onToggleActive={(slug, active) => void handleToggleActive(slug, active)}
                    actionLoading={actionLoading}
                    onImpersonate={(slug) => void handleImpersonate(slug)}
                    onToggleMarketplace={(t) => void handleToggleMarketplace(t)}
                    onLoginAs={(t) => handleLoginAs(t)}
                    onViewProducts={(t) => setProductsTarget({ slug: t.slug, name: t.name })}
                    onDelete={(slug, name) => setDeleteTarget({ slug, name })}
                    onPurge={(slug, name) => void handlePurgeTenant(slug, name)}
                  />
                ))}
              </div>
            )
          )}

          {viewMode === "table" && (
            <TenantTable tenants={sorted} loading={loading} actionLoading={actionLoading}
              sortField={sortField} sortDir={sortDir} onSort={toggleSort}
              onDetail={(t) => setDetailTarget(t)}
              onToggleActive={(slug, active) => void handleToggleActive(slug, active)}
              onImpersonate={(slug) => void handleImpersonate(slug)}
              onInvite={(slug, name) => setInviteTarget({ slug, name })}
              onPurge={(slug, name) => void handlePurgeTenant(slug, name)}
              onDelete={(slug, name) => setDeleteTarget({ slug, name })}
              onPlanChange={(slug, plan) => void handlePlanChange(slug, plan)}
            />
          )}
        </>
      )}

      {/* Tab: Crecimiento */}
      {pageTab === "crecimiento" && (
        <TenantGrowthTab growthData={growthData} loading={growthLoading} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white transition-all ${toast.ok ? "bg-[var(--accent)]" : "bg-[var(--data-error)]"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {inviteTarget && <InviteModal tenantSlug={inviteTarget.slug} tenantName={inviteTarget.name} onClose={() => setInviteTarget(null)} />}
      {detailTarget && <TenantDetailModal tenant={detailTarget} onClose={() => setDetailTarget(null)} />}
      {productsTarget && (
        <TenantProductsModal
          open={Boolean(productsTarget)}
          onClose={() => setProductsTarget(null)}
          tenantSlug={productsTarget.slug}
          tenantName={productsTarget.name}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal name={deleteTarget.name} slug={deleteTarget.slug}
          loading={actionLoading === `${deleteTarget.slug}-delete`}
          onConfirm={() => void handleDeleteTenant(deleteTarget.slug, deleteTarget.name)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {nuclearResetOpen && (
        <NuclearResetModal loading={nuclearResetLoading}
          onConfirm={() => void handleNuclearReset()}
          onCancel={() => setNuclearResetOpen(false)}
        />
      )}
    </div>
  );
}
