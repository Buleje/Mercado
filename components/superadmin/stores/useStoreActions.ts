"use client";

import { useCallback } from "react";
import type { StoreRow } from "./types";
import { csrfHeaders } from "@/lib/csrf-client";

interface UseStoreActionsParams {
  setSaving: (id: string | null) => void;
  showToast: (msg: string, ok: boolean) => void;
  onRefresh: () => void;
  editCommission: { id: string; value: string } | null;
  setEditCommission: (v: { id: string; value: string } | null) => void;
}

export function useStoreActions({
  setSaving,
  showToast,
  onRefresh,
  editCommission,
  setEditCommission,
}: UseStoreActionsParams) {
  const togglePublished = useCallback(
    async (store: StoreRow) => {
      setSaving(store.id);
      try {
        const res = await fetch("/api/superadmin/stores", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ storeId: store.id, isPublished: !store.isPublished }),
        });
        if (!res.ok) throw new Error();
        showToast(`${store.name} ${!store.isPublished ? "publicada" : "ocultada"}`, true);
        onRefresh();
      } catch {
        showToast("Error al actualizar", false);
      } finally {
        setSaving(null);
      }
    },
    [setSaving, showToast, onRefresh],
  );

  const saveCommission = useCallback(
    async (storeId: string) => {
      if (!editCommission) return;
      const val = parseFloat(editCommission.value);
      if (isNaN(val) || val < 0 || val > 100) {
        showToast("Comisión debe ser entre 0 y 100%", false);
        return;
      }
      setSaving(storeId);
      try {
        const res = await fetch("/api/superadmin/stores", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ storeId, commission: val }),
        });
        if (!res.ok) throw new Error();
        showToast("Comisión actualizada", true);
        setEditCommission(null);
        onRefresh();
      } catch {
        showToast("Error al guardar comisión", false);
      } finally {
        setSaving(null);
      }
    },
    [editCommission, setSaving, showToast, setEditCommission, onRefresh],
  );

  // Beneficio de visibilidad en /tiendas: standard | featured | premium.
  const setDisplayTier = useCallback(
    async (store: StoreRow, displayTier: "standard" | "featured" | "premium") => {
      setSaving(store.id);
      try {
        const res = await fetch("/api/superadmin/stores", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ storeId: store.id, displayTier }),
        });
        if (!res.ok) throw new Error();
        const label =
          displayTier === "premium" ? "Premium" : displayTier === "featured" ? "Destacada" : "Estándar";
        showToast(`${store.name} → ${label}`, true);
        onRefresh();
      } catch {
        showToast("Error al cambiar el nivel", false);
      } finally {
        setSaving(null);
      }
    },
    [setSaving, showToast, onRefresh],
  );

  return { togglePublished, saveCommission, setDisplayTier };
}
