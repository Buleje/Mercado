"use client";

import { useCallback } from "react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { csrfHeaders } from "@/lib/csrf-client";

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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { showToast("Error al cambiar plan", false); return; }
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, plan } : t)));
      showToast(`Plan de ${slug} → ${plan}`);
    } finally { setActionLoading(null); }
  }, [setTenants, setActionLoading, showToast]);

  const handleDeleteTenant = useCallback(async (slug: string, name: string) => {
    // P0 fix 2026-05-24: TOTP step-up obligatorio en server.
    const totpCode = window.prompt(
      `Código TOTP (6 dígitos) para confirmar borrado de "${name}":`,
    );
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      showToast("Código TOTP inválido — operación cancelada", false);
      return;
    }
    setActionLoading(`${slug}-delete`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/delete`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ totpCode }),
      });
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
      // P0 fix 2026-05-24: ahora el server requiere CSRF token.
      // Nota: el body con { confirm, reason, totpCode } se enviará desde un
      // formulario más rico cuando se actualice el modal — por ahora vacío
      // dispara 400 con `details` indicando los campos faltantes.
      const res = await fetch("/api/superadmin/purge", {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
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
    // P0 fix 2026-05-24: TOTP step-up + body { confirm, reason, totpCode }
    const totpCode = window.prompt(`Código TOTP (6 dígitos) para purgar "${name}":`);
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      showToast("Código TOTP inválido — operación cancelada", false);
      return;
    }
    const reason = window.prompt(`Motivo (mínimo 10 caracteres):`, "Limpieza de datos a pedido del cliente");
    if (!reason || reason.trim().length < 10) {
      showToast("Motivo requerido (mín. 10 caracteres)", false);
      return;
    }
    setActionLoading(`${slug}-purge`);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/purge`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          confirm: `PURGE-${slug}`,
          reason: reason.trim(),
          totpCode,
        }),
      });
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) { showToast("Error al impersonar", false); return; }
      // [SEGURIDAD MULTI-TENANT] Limpiar TODO cache cliente antes de abrir el
      // panel del tenant target. Sin esto, el localStorage/sessionStorage/SW
      // compartido entre pestañas filtraría datos del tenant anterior.
      try {
        const { clearAllTenantCache } = await import("@/lib/tenant-cache");
        clearAllTenantCache();
        // Notificar a pestañas abiertas del mismo origen para que también
        // limpien su estado en memoria si están en otro tenant.
        try {
          const bc = new BroadcastChannel("tenant-switch");
          bc.postMessage({ type: "tenant-switched", slug, ts: Date.now() });
          bc.close();
        } catch { /* BroadcastChannel no disponible */ }
      } catch { /* fallback: assertTenantOwnership en /admin lo cubrirá */ }
      // Cache-busting query (_fresh) garantiza que Next no sirva HTML cacheado
      // de un tenant previo y que assertTenantOwnership detecte el switch.
      // /t/{slug}/admin fuerza al proxy a setear x-tenant-id por URL.
      window.open(
        `/t/${encodeURIComponent(slug)}/admin?_fresh=${Date.now()}`,
        "_blank",
      );
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
