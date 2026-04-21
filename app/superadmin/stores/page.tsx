"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Package, Ticket, BarChart3, Palette, Menu } from "@buleje/design-system/icons";
import { StoresTab } from "@/components/superadmin/stores/StoresTab";
import { OrdersTab } from "@/components/superadmin/stores/OrdersTab";
import { CouponsTab } from "@/components/superadmin/stores/CouponsTab";
import { AnalyticsTab } from "@/components/superadmin/stores/AnalyticsTab";
import { PersonalizarTab } from "@/components/superadmin/stores/PersonalizarTab";
import { NavegacionTab } from "@/components/superadmin/stores/NavegacionTab";
import type { StoreRow, StoreTab } from "@/components/superadmin/stores/types";

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS: { key: StoreTab; label: string; icon: React.ReactNode }[] = [
  { key: "stores", label: "Tiendas", icon: <ShoppingBag className="w-4 h-4" /> },
  { key: "orders", label: "Pedidos", icon: <Package className="w-4 h-4" /> },
  { key: "coupons", label: "Cupones", icon: <Ticket className="w-4 h-4" /> },
  { key: "analytics", label: "Analítica", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "personalizar", label: "Personalizar", icon: <Palette className="w-4 h-4" /> },
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-[var(--text-secondary)]" />
            Administrar Marketplace
          </h1>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">
            Gestión completa de tiendas, pedidos, cupones y métricas del marketplace
          </p>
        </div>
      </div>

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
      {tab === "orders" && <OrdersTab />}
      {tab === "coupons" && <CouponsTab />}
      {tab === "analytics" && <AnalyticsTab stores={stores} />}
      {tab === "personalizar" && <PersonalizarTab stores={stores} onRefresh={handleRefresh} />}
      {tab === "navegacion" && <NavegacionTab />}
    </div>
  );
}
