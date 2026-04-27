"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Package, Ticket, BarChart3, Palette, Menu, ShieldCheck, Activity, Image as ImageIcon } from "@buleje/design-system/icons";
import { StoresTab } from "@/components/superadmin/stores/StoresTab";
// OrdersTab fusionado en OperationsTab
// import { OrdersTab } from "@/components/superadmin/stores/OrdersTab";
import { CouponsTab } from "@/components/superadmin/stores/CouponsTab";
import { AnalyticsTab } from "@/components/superadmin/stores/AnalyticsTab";
// PersonalizarTab fusionado en StoresTab
// import { PersonalizarTab } from "@/components/superadmin/stores/PersonalizarTab";
import { NavegacionTab } from "@/components/superadmin/stores/NavegacionTab";
import { HealthTab } from "@/components/superadmin/stores/HealthTab";
import { OperationsTab } from "@/components/superadmin/stores/OperationsTab";
import { CategoriesTab } from "@/components/superadmin/stores/CategoriesTab";
import type { StoreRow, StoreTab } from "@/components/superadmin/stores/types";
import { AdminTabShell } from "../_components/_shared";

// ─── Tabs config ──────────────────────────────────────────────────────────────

// Tabs unificadas (Pedidos fusionado en Operaciones, Personalizar fusionada en Tiendas)
const TABS: { key: StoreTab; label: string; icon: React.ReactNode }[] = [
  { key: "stores", label: "Tiendas", icon: <ShoppingBag className="w-4 h-4" /> },
  { key: "health", label: "Salud", icon: <ShieldCheck className="w-4 h-4" /> },
  { key: "operations", label: "Operaciones", icon: <Activity className="w-4 h-4" /> },
  { key: "categories", label: "Categorías", icon: <ImageIcon className="w-4 h-4" /> },
  { key: "coupons", label: "Cupones", icon: <Ticket className="w-4 h-4" /> },
  { key: "analytics", label: "Analítica", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "navegacion", label: "Navegación", icon: <Menu className="w-4 h-4" /> },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<StoreTab>("stores");

  const load = useCallback(async (silent = false) => {
    if (!silent) setStores(undefined);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/stores", { credentials: "include" });
      if (!res.ok) { setError("Error al cargar tiendas"); return; }
      const data = await res.json() as { stores: StoreRow[] };
      setStores(data.stores);
    } catch {
      setError("Error de red");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => void load(true), [load]);

  return (
    <AdminTabShell
      title="Administrar Marketplace"
      description="Gestión completa de tiendas, pedidos, cupones y métricas del marketplace."
      icon={ShoppingBag}
      kicker="Marketplace"
    >
      {/* Tab bar — Ola 3: tab activo usa accent-soft (bg tenue) en vez de primary saturado */}
      <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "stores" && (
        <StoresTab
          stores={stores}
          loading={stores === undefined && !error}
          error={error}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      )}
      {tab === "health" && <HealthTab />}
      {tab === "operations" && <OperationsTab />}
      {tab === "categories" && <CategoriesTab />}
      {/* Pedidos fusionado en Operaciones — la tab "orders" ya no existe */}
      {tab === "coupons" && <CouponsTab />}
      {tab === "analytics" && <AnalyticsTab stores={stores} />}
      {/* Personalizar fusionado en Tiendas — la tab "personalizar" ya no existe */}
      {tab === "navegacion" && <NavegacionTab />}
    </AdminTabShell>
  );
}
