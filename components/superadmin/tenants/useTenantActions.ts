"use client";

import { useCallback } from "react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";

interface UseTenantActionsParams {
  setTenants: React.Dispatch<React.SetStateAction<TenantRow[]>>;
  setActionLoading: (key: string | null) => void;
  setNuclearResetOpen: (open: boolean) => void;
  setNuclearResetLoading: (loading: boolean) => void;
  setDeleteTarget: (target: { slug: string; name: string } | null) => void;
  showToast: (msg: string, ok?: boolean) => void;
  loadTenants: () => Promise<void>;
}

export function useTenantActions({
  setTenants,
  setActionLoading,
  setNuclearResetOpen,
  setNuclearResetLoading,
  setDeleteTarget,
  showToast,
  loadTenants,
}: UseTenantActionsParams) {
  const handleToggleActive = useCallback(async (slug: string, current: boolean) => {
    setActionLoading(`${slug}-active`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !current }),
      });
      if (!res.ok) { showToast("Error al actualizar estado", false); return; }
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, active: !current } : t)));
      showToast(`${slug} ${!current ? "activada" : "suspendida"}`);
    } finally { setActionLoading(null); }
  }, [setTenants, setActionLoading, showToast]);

  const handlePlanChange = useCallback(async (slug: string, plan: PlanId) => {
    setActionLoading(`${slug}-plan`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { showToast("Error al cambiar plan", false); return; }
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, plan } : t)));
      showToast(`Plan de ${slug} → ${plan}`);
    } finally { setActionLoading(null); }
  }, [setTenants, setActionLoading, showToast]);

  const handleDeleteTenant = useCallback(async (slug: string, name: string) => {
    setActionLoading(`${slug}-delete`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/delete`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        showToast((err as { error?: string }).error ?? "Error al eliminar", false);
        return;
      }
      setTenants((prev) => prev.filter((t) => t.slug !== slug));
      setDeleteTarget(null);
      showToast(`Tienda "${name}" eliminada`);
    } finally { setActionLoading(null); }
  }, [setTenants, setActionLoading, setDeleteTarget, showToast]);

  const handleNuclearReset = useCallback(async () => {
    setNuclearResetLoading(true);
    try {
      const res = await fetch("/api/superadmin/purge", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        showToast((err as { error?: string }).error ?? "Error al limpiar datos", false);
        return;
      }
      const data = await res.json() as { deletedRows: number; message: string };
      setNuclearResetOpen(false);
      showToast(data.message ?? `Sistema limpiado — ${data.deletedRows} registros eliminados`);
      await loadTenants();
    } finally { setNuclearResetLoading(false); }
  }, [setNuclearResetLoading, setNuclearResetOpen, showToast, loadTenants]);

  const handlePurgeTenant = useCallback(async (slug: string, name: string) => {
    if (!confirm(`¿Limpiar TODOS los datos de "${name}"?\n\nSe eliminarán productos, pedidos, movimientos, ventas y todo el historial.\nLa tienda seguirá activa pero vacía.`)) return;
    setActionLoading(`${slug}-purge`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/purge`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        showToast((err as { error?: string }).error ?? "Error al limpiar datos", false);
        return;
      }
      const data = await res.json() as { deletedRows: number; message: string };
      showToast(data.message ?? `Datos de "${name}" limpiados — ${data.deletedRows} registros eliminados`);
      await loadTenants();
    } finally { setActionLoading(null); }
  }, [setActionLoading, showToast, loadTenants]);

  const handleImpersonate = useCallback(async (slug: string) => {
    try {
      const res = await fetch("/api/superadmin/impersonate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) { showToast("Error al impersonar", false); return; }
      window.open(`/t/${slug}/admin`, "_blank");
    } catch { showToast("Error de red", false); }
  }, [showToast]);

  const handleToggleMarketplace = useCallback(async (tenant: TenantRow) => {
    const store = tenant.stores?.[0];
    if (!store) { showToast("Esta tienda no tiene Store en marketplace", false); return; }
    const newPublished = !store.isPublished;
    const action = newPublished ? "publicar" : "dar de baja";
    if (!window.confirm(`¿${newPublished ? "Publicar" : "Dar de baja"} "${tenant.name}" ${newPublished ? "en" : "del"} marketplace?`)) return;
    setActionLoading(`${tenant.slug}-marketplace`);
    try {
      const res = await fetch("/api/superadmin/stores", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, isPublished: newPublished }),
      });
      if (!res.ok) { showToast(`Error al ${action}`, false); return; }
      setTenants((prev) =>
        prev.map((t) => {
          if (t.slug !== tenant.slug) return t;
          const updatedStores = (t.stores ?? []).map((s) =>
            s.id === store.id ? { ...s, isPublished: newPublished } : s
          );
          return { ...t, stores: updatedStores };
        })
      );
      showToast(`${tenant.name} ${newPublished ? "publicada en" : "dada de baja del"} marketplace`);
    } finally { setActionLoading(null); }
  }, [setTenants, setActionLoading, showToast]);

  const handleLoginAs = useCallback((tenant: TenantRow) => {
    window.open(`/admin/login?tenant=${encodeURIComponent(tenant.slug)}&auto=1`, "_blank");
    showToast(`Abriendo login como ${tenant.name}...`);
  }, [showToast]);

  return {
    handleToggleActive,
    handlePlanChange,
    handleDeleteTenant,
    handleNuclearReset,
    handlePurgeTenant,
    handleImpersonate,
    handleToggleMarketplace,
    handleLoginAs,
  };
}
