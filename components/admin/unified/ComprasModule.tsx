"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Lightbulb, ClipboardList, Users, PackageCheck,
  BarChart3, PackagePlus, ShoppingBasket, RotateCcw, Receipt,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

export const TabError = () => (
  <div className="text-center py-12">
    <p className="text-sm text-[var(--data-error-500)]">Error al cargar el módulo</p>
    <button onClick={() => window.location.reload()} className="mt-2 text-xs text-primary hover:underline">Recargar página</button>
  </div>
);

const SugerenciasCompraTab = dynamic(() => import("@/components/admin/compras/SugerenciasCompraTab"), { loading: S });
const PurchaseOrdersTab = dynamic(() => import("@/components/admin/PurchaseOrdersTab"), { loading: S });
const SuppliersTab = dynamic(() => import("@/components/admin/SuppliersTab"), { loading: S });
const ReceivingTab = dynamic(() => import("@/components/admin/ReceivingTab"), { loading: S });
const PuntoCompraView = dynamic(() => import("@/components/admin/pos/PuntoCompraView"), { loading: S });
const SupplierComparator = dynamic(() => import("@/components/admin/SupplierComparator"), { ssr: false, loading: S });
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: S });
const HistorialGastosTab = dynamic(() => import("@/components/admin/compras/HistorialGastosTab"), { loading: S });

const MODULE_ID = "compras";

const TABS: AdminTab[] = [
  { id: "punto-compra", label: "Punto de Compra", icon: ShoppingBasket },
  { id: "historial-gastos", label: "Historial de Gastos", icon: Receipt },
  { id: "sugerencias", label: "Sugerencias", icon: Lightbulb },
  { id: "ordenes-compra", label: "Ordenes", icon: ClipboardList },
  { id: "proveedores", label: "Proveedores", icon: Users },
  { id: "recepcion", label: "Recepcion", icon: PackageCheck },
  { id: "comparador", label: "Comparador", icon: BarChart3 },
  { id: "devoluciones", label: "Devoluciones", icon: RotateCcw },
];

function normalizeComprasTab(savedTab: string | null): string {
  if (savedTab === "dashboard") return TABS[0].id;
  return TABS.some((tab) => tab.id === savedTab) ? savedTab as string : TABS[0].id;
}

// ── Componente principal ────────────────────────────────────────────────────

export default function ComprasModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return normalizeComprasTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  // Escuchar evento de navegación desde PuntoCompraView (botón "Ver en Órdenes")
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail;
      if (tabId && TABS.some(t => t.id === tabId)) setSub(tabId);
    };
    window.addEventListener("compras-navigate-tab", handler);
    return () => window.removeEventListener("compras-navigate-tab", handler);
  }, []);

  // Pre-fetch de products + suppliers al montar el módulo Compras —
  // así cuando el usuario entra a Punto de Compra/Sugerencias/Proveedores
  // los datos ya están cacheados (warmup en background, no bloquea render).
  useEffect(() => {
    const logFail = (ctx: string) => (err: unknown) =>
      console.warn(`[compras-prefetch] ${ctx} failed`, err instanceof Error ? err.message : String(err));
    void Promise.allSettled([
      fetch("/api/products").then(r => r.ok ? r.json() : null).then(json => {
        if (!json) return;
        const raw = Array.isArray(json) ? json : json.products ?? [];
        const filtered = raw.filter((p: { active?: boolean }) => p.active !== false);
        try { localStorage.setItem("poc-products-cache", JSON.stringify({ data: filtered, ts: Date.now() })); } catch { /* quota */ }
      }).catch(logFail("products")),
      fetch("/api/suppliers").then(r => r.ok ? r.json() : null).then(json => {
        if (!json) return;
        const raw = json.suppliers ?? (Array.isArray(json) ? json : []);
        try { localStorage.setItem("poc-suppliers-cache", JSON.stringify({ data: raw, ts: Date.now() })); } catch { /* quota */ }
      }).catch(logFail("suppliers")),
    ]);
  }, []);



  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Abastecimiento · Compras"
        title="Compras"
        description="Pedidos a proveedores, recepción y cuentas por pagar."
        icon={PackagePlus}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId="compras"
      >
        {sub === "punto-compra" && <PuntoCompraView />}
        {sub === "historial-gastos" && <HistorialGastosTab />}
        {sub === "sugerencias" && <SugerenciasCompraTab />}
        {sub === "ordenes-compra" && <PurchaseOrdersTab />}
        {sub === "proveedores" && <SuppliersTab />}
        {sub === "recepcion" && <ReceivingTab />}
        {sub === "comparador" && (
          <SupplierComparator
            onCreateOC={(supplier) => {
              // "Crear OC" desde el comparador → llevar al flujo de Nueva Orden
              // con el proveedor preseleccionado (una OC necesita productos; no
              // se crea vacía por API). PurchaseOrdersTab lee este stash al montar.
              try { localStorage.setItem("bsm-new-oc-supplier", JSON.stringify(supplier)); } catch { /* quota */ }
              setSub("ordenes-compra");
            }}
          />
        )}
        {sub === "devoluciones" && <DevolucionesProveedorModule />}
      </AdminTabBar>
    </div>
  );
}
