"use client";

import { etiquetaDePlan } from "@/lib/billing/plan-tiers";
import { useState, useCallback } from "react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { useTenantActions } from "@/components/superadmin/tenants/useTenantActions";

type Acciones = ReturnType<typeof useTenantActions>;

interface Opciones {
  tenants: TenantRow[];
  showToast: (msg: string, ok?: boolean) => void;
  handleExtendTrial: Acciones["handleExtendTrial"];
  handleToggleActive: Acciones["handleToggleActive"];
  handlePlanChange: Acciones["handlePlanChange"];
}

/** Modo selección de la lista de tiendas y sus acciones masivas (CSV, plan, prueba, suspender). */
export function useTenantsSeleccion({ tenants, showToast, handleExtendTrial, handleToggleActive, handlePlanChange }: Opciones) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkMode(false);
  }, []);
  const handleBulkExport = useCallback(() => {
    const selected = tenants.filter((t) => selectedIds.has(t.id));
    const rows = [
      ["ID", "Slug", "Nombre", "Plan", "Activo", "Email", "Ventas mes", "Pedidos pendientes"],
      ...selected.map((t) => [
        t.id, t.slug, t.name, t.plan, t.active ? "sí" : "no",
        t.ownerEmail ?? "", String(t.monthRevenue ?? 0), String(t.pendingOrders ?? 0),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${selected.length} tenant${selected.length === 1 ? "" : "s"} exportado${selected.length === 1 ? "" : "s"}`, true);
  }, [tenants, selectedIds, showToast]);

  // ── Acciones masivas (bundle D2) — loop sobre los handlers existentes ──────
  const bulkExtendTrial = useCallback(async () => {
    const list = tenants.filter((t) => selectedIds.has(t.id));
    for (const t of list) await handleExtendTrial(t.slug, 14);
    showToast(`Trial +14d en ${list.length} tienda(s)`, true);
    clearSelection();
  }, [tenants, selectedIds, handleExtendTrial, showToast, clearSelection]);
  const bulkSuspend = useCallback(async () => {
    const active = tenants.filter((t) => selectedIds.has(t.id) && t.active);
    for (const t of active) await handleToggleActive(t.slug, true);
    showToast(`${active.length} tienda(s) suspendida(s)`, true);
    clearSelection();
  }, [tenants, selectedIds, handleToggleActive, showToast, clearSelection]);
  const bulkSetPlan = useCallback(async (plan: PlanId) => {
    const list = tenants.filter((t) => selectedIds.has(t.id));
    for (const t of list) await handlePlanChange(t.slug, plan);
    showToast(`Plan → ${etiquetaDePlan(plan)} en ${list.length} tienda(s)`, true);
    clearSelection();
  }, [tenants, selectedIds, handlePlanChange, showToast, clearSelection]);
  return {
    bulkMode, setBulkMode, selectedIds, setSelectedIds, bulkMessageOpen, setBulkMessageOpen,
    toggleSelected, clearSelection, handleBulkExport, bulkExtendTrial, bulkSuspend, bulkSetPlan,
  };
}

export type TenantsSeleccion = ReturnType<typeof useTenantsSeleccion>;
