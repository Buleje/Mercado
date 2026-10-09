"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XCircle, Clock, AlertTriangle } from "@buleje/design-system/icons";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import type { SortField, SortDir } from "@/components/superadmin/tenants/types";
import type { AlertItemShape } from "@/components/superadmin/tenants/TenantsAlertsBanner";

export type QuickFilter = "all" | "active" | "inactive" | "pro" | "enterprise" | "trial" | "pending" | "trial-expiring" | "overwhelmed" | "stale" | "at-risk";
export type Health = "healthy" | "warning" | "critical";

export interface TenantsStats {
  total: number;
  active: number;
  inactive: number;
  trial: number;
  pendingTotal: number;
  tenantsWithPending: number;
  atRisk: number;
  mrr: number;
  byPlan: Record<PlanId, number>;
}

/** Búsqueda, filtros, orden y atajos de la lista de tiendas (persistidos en la URL) + KPIs y alertas. */
export function useTenantsFiltros(tenants: TenantRow[]) {
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<"all" | PlanId>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  // ── Stats hero — overview de la base de tenants ────────────────────────
  const stats = useMemo<TenantsStats>(() => {
    const activeCount = tenants.filter((t) => t.active).length;
    // Solo tiendas activas (mismo criterio que «Trials activos» de Billing): las de prueba dadas de baja no cuentan.
    const trialCount = tenants.filter(
      (t) => t.active && t.trialEndsAt && new Date(t.trialEndsAt) > new Date(),
    ).length;
    const pendingTotal = tenants.reduce((s, t) => s + (t.pendingOrders ?? 0), 0);
    const tenantsWithPending = tenants.filter((t) => (t.pendingOrders ?? 0) > 0).length;
    const atRisk = tenants.filter((t) => t.risk && (t.risk.level === "high" || t.risk.level === "critical")).length;
    const mrr = tenants.reduce((s, t) => s + (t.monthRevenue ?? 0), 0);
    const byPlan: Record<PlanId, number> = { free: 0, pro: 0, business: 0, enterprise: 0 };
    for (const t of tenants) {
      if (t.plan in byPlan) byPlan[t.plan]++;
    }
    return {
      total: tenants.length,
      active: activeCount,
      inactive: tenants.length - activeCount,
      trial: trialCount,
      pendingTotal,
      tenantsWithPending,
      atRisk,
      mrr,
      byPlan,
    };
  }, [tenants]);

  // ── Quick filter chips — atajos comunes ───────────────────────────────
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // ── URL state — persistencia de filtros para URLs compartibles ────────
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  // Hidratar desde URL al primer render
  useEffect(() => {
    if (hydratedFromUrl) return;
    const q = searchParams.get("q");
    const plan = searchParams.get("plan") as "all" | PlanId | null;
    const status = searchParams.get("status") as "all" | "active" | "inactive" | null;
    const qf = searchParams.get("qf") as QuickFilter | null;
    const sort = searchParams.get("sort");
    if (q) setSearch(q);
    if (plan) setFilterPlan(plan);
    if (status) setFilterActive(status);
    if (qf) setQuickFilter(qf);
    if (sort) {
      const [f, d] = sort.split("-");
      if (f) setSortField(f as SortField);
      if (d === "asc" || d === "desc") setSortDir(d);
    }
    setHydratedFromUrl(true);
  }, [searchParams, hydratedFromUrl]);

  // Sync filtros → URL (sólo después de hidratar para no pisar la URL inicial)
  useEffect(() => {
    if (!hydratedFromUrl) return;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterPlan !== "all") params.set("plan", filterPlan);
    if (filterActive !== "all") params.set("status", filterActive);
    if (quickFilter !== "all") params.set("qf", quickFilter);
    if (sortField !== "createdAt" || sortDir !== "desc") {
      params.set("sort", `${sortField}-${sortDir}`);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [search, filterPlan, filterActive, quickFilter, sortField, sortDir, hydratedFromUrl, router]);

  // ── Health score por tenant ──────────────────────────────────────────
  // Cálculo simple basado en signals visibles:
  //   • activo: 25 pts
  //   • sin trial activo (paga): 25 pts
  //   • pendientes <5: 25 pts
  //   • tiene revenue del mes: 25 pts
  const getHealth = useCallback((t: TenantRow): Health => {
    if (!t.active) return "critical";
    let score = 0;
    if (t.active) score += 25;
    const inTrial = t.trialEndsAt && new Date(t.trialEndsAt) > new Date();
    if (!inTrial && t.plan !== "free") score += 25;
    if ((t.pendingOrders ?? 0) < 5) score += 25;
    if ((t.monthRevenue ?? 0) > 0) score += 25;
    if (score >= 75) return "healthy";
    if (score >= 50) return "warning";
    return "critical";
  }, []);

  // ── Alertas accionables — derivadas de los datos actuales ────────────
  const alerts = useMemo<AlertItemShape[]>(() => {
    const list: AlertItemShape[] = [];
    // Trial vence en 7 días
    const trialExpiring = tenants.filter((t) => {
      if (!t.trialEndsAt) return false;
      const days = (new Date(t.trialEndsAt).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 7;
    });
    if (trialExpiring.length > 0) {
      list.push({
        id: "trial-expiring",
        icon: Clock,
        tone: "amber",
        label: `${trialExpiring.length} trial${trialExpiring.length === 1 ? "" : "s"} vence${trialExpiring.length === 1 ? "" : "n"} en menos de 7 días`,
        count: trialExpiring.length,
        onClick: () => { setQuickFilter("trial-expiring"); setFilterPlan("all"); setFilterActive("all"); },
      });
    }
    // Tenants con >10 pendientes
    const overwhelmed = tenants.filter((t) => (t.pendingOrders ?? 0) >= 10);
    if (overwhelmed.length > 0) {
      list.push({
        id: "overwhelmed",
        icon: AlertTriangle,
        tone: "amber",
        label: `${overwhelmed.length} tienda${overwhelmed.length === 1 ? "" : "s"} con más de 10 pedidos sin atender`,
        count: overwhelmed.length,
        onClick: () => { setQuickFilter("overwhelmed"); setFilterPlan("all"); setFilterActive("all"); },
      });
    }
    // Tenants suspendidos
    const suspended = tenants.filter((t) => !t.active);
    if (suspended.length > 0) {
      list.push({
        id: "suspended",
        icon: XCircle,
        tone: "rose",
        label: `${suspended.length} tienda${suspended.length === 1 ? "" : "s"} suspendida${suspended.length === 1 ? "" : "s"}`,
        count: suspended.length,
        onClick: () => { setQuickFilter("inactive"); setFilterActive("inactive"); setFilterPlan("all"); },
      });
    }
    return list;
  }, [tenants]);

  const applyQuickFilter = (qf: QuickFilter) => {
    setQuickFilter(qf);
    // Reset filtros granulares y aplica preset
    if (qf === "all") {
      setFilterActive("all"); setFilterPlan("all");
    } else if (qf === "active") {
      setFilterActive("active"); setFilterPlan("all");
    } else if (qf === "inactive") {
      setFilterActive("inactive"); setFilterPlan("all");
    } else if (qf === "pro") {
      setFilterPlan("pro"); setFilterActive("all");
    } else if (qf === "enterprise") {
      setFilterPlan("enterprise"); setFilterActive("all");
    } else if (qf === "trial" || qf === "pending") {
      setFilterActive("all"); setFilterPlan("all");
    }
  };

  // Quick filters virtuales aplican filtros adicionales sobre `sorted`.
  const sortedFinal = useMemo(() => {
    if (quickFilter === "trial") {
      return sorted.filter((t) => t.active && t.trialEndsAt && new Date(t.trialEndsAt) > new Date());
    }
    if (quickFilter === "pending") {
      return sorted.filter((t) => (t.pendingOrders ?? 0) > 0);
    }
    if (quickFilter === "trial-expiring") {
      return sorted.filter((t) => {
        if (!t.trialEndsAt) return false;
        const days = (new Date(t.trialEndsAt).getTime() - Date.now()) / 86_400_000;
        return days >= 0 && days <= 7;
      });
    }
    if (quickFilter === "overwhelmed") {
      return sorted.filter((t) => (t.pendingOrders ?? 0) >= 10);
    }
    if (quickFilter === "at-risk") {
      return sorted.filter((t) => t.risk && (t.risk.level === "high" || t.risk.level === "critical"));
    }
    return sorted;
  }, [sorted, quickFilter]);

  return {
    search, setSearch, filterPlan, setFilterPlan, filterActive, setFilterActive,
    sortField, setSortField, sortDir, setSortDir, quickFilter, setQuickFilter,
    toggleSort, stats, getHealth, alerts, applyQuickFilter, sortedFinal,
  };
}
