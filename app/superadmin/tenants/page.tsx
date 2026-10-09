"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, XCircle } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { AdminTabShell } from "../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { TenantModulesModal } from "@/components/superadmin/tenants/TenantModulesModal";
import { TenantTable } from "@/components/superadmin/tenants/TenantTable";
import { TenantProductsModal } from "@/components/superadmin/tenants/TenantProductsModal";
import TenantAddProductModal from "@/components/superadmin/tenants/TenantAddProductModal";
import { InviteModal } from "@/components/superadmin/tenants/InviteModal";
import { BulkMessageModal } from "@/components/superadmin/tenants/BulkMessageModal";
import { TenantDetailModal } from "@/components/superadmin/tenants/TenantDetailModal";
import { DeleteConfirmModal } from "@/components/superadmin/tenants/DeleteConfirmModal";
import { NuclearResetModal } from "@/components/superadmin/tenants/NuclearResetModal";
import { useTenantActions } from "@/components/superadmin/tenants/useTenantActions";
import type { ViewMode } from "@/components/superadmin/tenants/types";
import { AlertsBanner } from "@/components/superadmin/tenants/TenantsAlertsBanner";
import { QuickFilters } from "@/components/superadmin/tenants/TenantsQuickFilters";
import { TenantsToolbar } from "@/components/superadmin/tenants/TenantsToolbar";
import { TenantsKpis } from "@/components/superadmin/tenants/TenantsKpis";
import { TenantsGrid } from "@/components/superadmin/tenants/TenantsGrid";
import { TenantsBulkBar } from "@/components/superadmin/tenants/TenantsBulkBar";
import { useTenantsCarga } from "@/components/superadmin/tenants/useTenantsCarga";
import { useTenantsFiltros } from "@/components/superadmin/tenants/useTenantsFiltros";
import { useTenantsSeleccion } from "@/components/superadmin/tenants/useTenantsSeleccion";
import type { TenantCardProps } from "@/components/superadmin/tenants/TenantCard";

export default function TenantsPage() {
  const { tenants, setTenants, loading, error, loadTenants, moduleOverrideCounts, setModuleOverrideCounts } = useTenantsCarga();
  const {
    search, setSearch, filterPlan, setFilterPlan, filterActive, setFilterActive,
    sortField, setSortField, sortDir, setSortDir, quickFilter, setQuickFilter,
    toggleSort, stats, getHealth, alerts, applyQuickFilter, sortedFinal,
  } = useTenantsFiltros(tenants);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Vista persistida — Brandon 2026-06-05: agrega modo "compact" (mini-cards
  // densas para ver muchas tiendas en poco espacio) y recuerda la elección.
  // localStorage se lee post-mount (no en el initializer) para no generar
  // hydration mismatch entre HTML del server y estado del cliente.
  // 09-10: sin elección guardada arranca en «compacta» (1,1 pantallas con 14 tiendas, medido) en vez de
  // «tarjetas» (5,4): ley de ≤2,5 pantallas. Las tarjetas siguen a un clic y la elección se recuerda.
  const [viewMode, setViewModeState] = useState<ViewMode>("compact");
  useEffect(() => {
    const saved = window.localStorage.getItem("sa-tenants-view");
    if (saved === "table" || saved === "cards" || saved === "compact") setViewModeState(saved);
  }, []);
  const setViewMode = useCallback((v: ViewMode) => {
    setViewModeState(v);
    try { window.localStorage.setItem("sa-tenants-view", v); } catch { /* private mode */ }
  }, []);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [detailTarget, setDetailTarget] = useState<TenantRow | null>(null);
  const [productsTarget, setProductsTarget] = useState<{ slug: string; name: string } | null>(null);
  const [addProductTarget, setAddProductTarget] = useState<{ slug: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(null);
  // Módulos a medida (override per-tenant de la plantilla) — Brandon 2026-06-05
  const [modulesTarget, setModulesTarget] = useState<TenantRow | null>(null);
  const [nuclearResetOpen, setNuclearResetOpen] = useState(false);
  const [nuclearResetLoading, setNuclearResetLoading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const {
    handleToggleActive,
    handlePlanChange,
    handleExtendTrial,
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

  const router = useRouter();
  const seleccion = useTenantsSeleccion({ tenants, showToast, handleExtendTrial, handleToggleActive, handlePlanChange });
  const { bulkMode, setBulkMode, selectedIds, setSelectedIds, toggleSelected, clearSelection, bulkMessageOpen, setBulkMessageOpen } = seleccion;
  const accionesCard: Omit<TenantCardProps, "tenant" | "health"> = {
    onDetail: (t) => setDetailTarget(t),
    onInvite: (slug, name) => setInviteTarget({ slug, name }),
    onToggleActive: (slug, active) => void handleToggleActive(slug, active),
    actionLoading,
    onImpersonate: (slug) => void handleImpersonate(slug),
    onToggleMarketplace: (t) => void handleToggleMarketplace(t),
    onLoginAs: (t) => handleLoginAs(t),
    onViewProducts: (t) => setProductsTarget({ slug: t.slug, name: t.name }),
    onAddProduct: (t) => setAddProductTarget({ slug: t.slug, name: t.name }),
    onDelete: (slug, name) => setDeleteTarget({ slug, name }),
    onPurge: (slug, name) => void handlePurgeTenant(slug, name),
  };

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
    <AdminTabShell
      info={{
        what: "Lista y gestiona todas las tiendas (tenants) de la plataforma: activarlas, suspenderlas, cambiarles el plan, ver sus pedidos pendientes e impersonarlas para soporte.",
        affects: "Suspender una tienda impide que sus clientes compren. Cambiar el plan modifica los límites de uso en tiempo real.",
        example: "Una tienda con 8 pedidos pendientes en la tarjeta aparece con badge rojo. Puedes hacer clic en 'Impersonar' para entrar a su panel y ayudarle a gestionarlos.",
      }}
      title="Tiendas"
      /* El conteo es un DATO: va a la vista como chip, no en la descripción
         (que ahora vive en el ⓘ y se perdía al haber `info`). */
      chip={{
        label: `${sortedFinal.length} tienda${sortedFinal.length !== 1 ? "s" : ""}${tenants.length !== sortedFinal.length ? ` de ${tenants.length}` : ""}`,
        tone: "muted",
      }}
      icon={Building2}
      kicker="Plataforma multi-tenant"
    >
      <TenantsKpis loading={loading} stats={stats} />

      {/* ═══════ FILA 2 · Alertas colapsables (1 línea cuando hay) ══════ */}
      {alerts.length > 0 && (
        <AlertsBanner alerts={alerts} />
      )}

      {/* ═══════ FILA 3 · Sticky toolbar — Brandon 2026-05-21 high-impact:
            con 6+ tenants el user scrollea mucho y pierde de vista search
            + filters. Sticky top con backdrop-blur preserva visibilidad sin
            perder espacio visual. `-mx-4 sm:-mx-6 px-4 sm:px-6` extiende
            al edge para que el blur cubra todo el ancho del main content. */}
      <TenantsToolbar
        search={search}
        setSearch={setSearch}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={(f, d) => { setSortField(f); setSortDir(d); }}
        viewMode={viewMode}
        setViewMode={setViewMode}
        bulkMode={bulkMode}
        onToggleBulk={() => { setBulkMode((m) => !m); if (bulkMode) setSelectedIds(new Set()); }}
        loading={loading}
        onReload={() => void loadTenants()}
        onNuclear={() => setNuclearResetOpen(true)}
      />

          {/* ═══════ FILA 4 · Quick filter chips (4 principales + Más ▾) ═ */}
          <QuickFilters
            quickFilter={quickFilter}
            applyQuickFilter={applyQuickFilter}
            stats={stats}
            filterPlan={filterPlan}
            setFilterPlan={(v) => { setFilterPlan(v); setQuickFilter("all"); }}
            filterActive={filterActive}
            setFilterActive={(v) => { setFilterActive(v); setQuickFilter("all"); }}
          />

          {error && (
            <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] rounded-xl px-4 py-3 text-sm flex items-center justify-between">
              {error}
              <button type="button" onClick={() => void loadTenants()} className="underline hover:no-underline text-xs">Reintentar</button>
            </div>
          )}

          <TenantsGrid
            loading={loading}
            viewMode={viewMode}
            sortedFinal={sortedFinal}
            totalTenants={tenants.length}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            toggleSelected={toggleSelected}
            getHealth={getHealth}
            onLimpiarFiltros={() => { setSearch(""); applyQuickFilter("all"); }}
            acciones={accionesCard}
          />

          {viewMode === "table" && (
            <TenantTable tenants={sortedFinal} loading={loading} actionLoading={actionLoading}
              sortField={sortField} sortDir={sortDir} onSort={toggleSort}
              onDetail={(t) => setDetailTarget(t)}
              onToggleActive={(slug, active) => void handleToggleActive(slug, active)}
              onImpersonate={(slug) => void handleImpersonate(slug)}
              onInvite={(slug, name) => setInviteTarget({ slug, name })}
              onPurge={(slug, name) => void handlePurgeTenant(slug, name)}
              onDelete={(slug, name) => setDeleteTarget({ slug, name })}
              onPlanChange={(slug, plan) => void handlePlanChange(slug, plan)}
              onExtendTrial={(slug, days) => void handleExtendTrial(slug, days)}
              onChat={(t) => router.push(`/superadmin/chat?tenant=${t.id}&name=${encodeURIComponent(t.name)}`)}
              onModules={(t) => setModulesTarget(t)}
              moduleOverrideCounts={moduleOverrideCounts}
            />
          )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white transition-all ${toast.ok ? "bg-[var(--accent)]" : "bg-[var(--data-error-500)]"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {inviteTarget && <InviteModal tenantSlug={inviteTarget.slug} tenantName={inviteTarget.name} onClose={() => setInviteTarget(null)} />}
      {modulesTarget && (
        <TenantModulesModal
          tenant={modulesTarget}
          onClose={() => setModulesTarget(null)}
          onSaved={(count) => {
            setModuleOverrideCounts((prev) => {
              const next = { ...prev };
              if (count > 0) next[modulesTarget.id] = count;
              else delete next[modulesTarget.id];
              return next;
            });
          }}
        />
      )}
      {detailTarget && <TenantDetailModal tenant={detailTarget} onClose={() => setDetailTarget(null)} onUpdated={() => void loadTenants()} />}
      {productsTarget && (
        <TenantProductsModal
          open={Boolean(productsTarget)}
          onClose={() => setProductsTarget(null)}
          tenantSlug={productsTarget.slug}
          tenantName={productsTarget.name}
        />
      )}
      {addProductTarget && (
        <TenantAddProductModal
          open={Boolean(addProductTarget)}
          onClose={() => setAddProductTarget(null)}
          tenantSlug={addProductTarget.slug}
          tenantName={addProductTarget.name}
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
          tenantCount={tenants.length}
          tenantNames={tenants.slice(0, 5).map((t) => t.name)}
        />
      )}

      {bulkMode && selectedIds.size > 0 && (
        <TenantsBulkBar seleccion={seleccion} sortedFinal={sortedFinal} tenants={tenants} showToast={showToast} />
      )}

      {bulkMessageOpen && (
        <BulkMessageModal
          tenantIds={[...selectedIds]}
          count={selectedIds.size}
          onClose={() => setBulkMessageOpen(false)}
          onSent={() => { setBulkMessageOpen(false); showToast(`Mensaje enviado a ${selectedIds.size} tienda(s)`, true); clearSelection(); }}
        />
      )}
    </AdminTabShell>
    </>
  );
}
