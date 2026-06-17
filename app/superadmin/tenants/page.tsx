"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, Search, ChevronDown, RefreshCw,
  CheckCircle2, XCircle, LayoutGrid, List, Bomb, Grid3x3,
  DollarSign, Sparkles, Bell,
  Clock, AlertTriangle, Check, Square, CheckSquare, Download, Mail, X, MessageSquare,
  TrendingUp,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { AdminTabShell } from "../_components/_shared";
import { SAStatChip } from "@/components/superadmin/_shared/SAStatChip";

import { TenantCard } from "@/components/superadmin/tenants/TenantCard";
import { TenantCardCompact } from "@/components/superadmin/tenants/TenantCardCompact";
import { TenantModulesModal } from "@/components/superadmin/tenants/TenantModulesModal";
import { TenantTable } from "@/components/superadmin/tenants/TenantTable";
import Link from "next/link";
import { TenantProductsModal } from "@/components/superadmin/tenants/TenantProductsModal";
import TenantAddProductModal from "@/components/superadmin/tenants/TenantAddProductModal";
import { InviteModal } from "@/components/superadmin/tenants/InviteModal";
import { BulkMessageModal } from "@/components/superadmin/tenants/BulkMessageModal";
import { TenantDetailModal } from "@/components/superadmin/tenants/TenantDetailModal";
import { DeleteConfirmModal } from "@/components/superadmin/tenants/DeleteConfirmModal";
import { NuclearResetModal } from "@/components/superadmin/tenants/NuclearResetModal";
import { useTenantActions } from "@/components/superadmin/tenants/useTenantActions";
import type { SortField, SortDir, ViewMode } from "@/components/superadmin/tenants/types";

const inputCls =
  "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
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
  // Vista persistida — Brandon 2026-06-05: agrega modo "compact" (mini-cards
  // densas para ver muchas tiendas en poco espacio) y recuerda la elección.
  // localStorage se lee post-mount (no en el initializer) para no generar
  // hydration mismatch entre HTML del server y estado del cliente.
  const [viewMode, setViewModeState] = useState<ViewMode>("cards");
  useEffect(() => {
    const saved = window.localStorage.getItem("sa-tenants-view");
    if (saved === "table" || saved === "compact") setViewModeState(saved);
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
  const [moduleOverrideCounts, setModuleOverrideCounts] = useState<Record<string, number>>({});
  const [nuclearResetOpen, setNuclearResetOpen] = useState(false);
  const [nuclearResetLoading, setNuclearResetLoading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Brandon 2026-05-21 high-impact: keyboard shortcut "/" focusea search
  // (Linear/Notion/GitHub pattern). Power-user UX: el superadmin trabaja
  // sobre N tenants y necesita filtrar rápido sin tocar el mouse.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      // Ignorar si ya está tipeando en un input/textarea/contenteditable
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadTenants = useCallback(async () => {
    setLoading(true); setError("");
    try {
      // Pedidos cacheados (60s) en /tenants. Para que el badge de pendientes
      // se actualice en vivo, cruzamos con /pending-counts (no cacheado).
      // Churn/health por tenant (Brandon 2026-06-14): score + riesgo para la
      // columna Salud + filtro por riesgo. Reusa /api/superadmin/churn.
      const [tenantsRes, countsRes, churnRes] = await Promise.all([
        fetchSuperadmin("/api/superadmin/tenants"),
        fetchSuperadmin("/api/superadmin/tenants/pending-counts"),
        fetchSuperadmin("/api/superadmin/churn?limit=200"),
      ]);
      if (!tenantsRes.ok) { setError("Error al cargar tenants"); return; }
      const data = await tenantsRes.json() as { tenants: TenantRow[] };
      const counts: Record<string, number> = countsRes.ok
        ? ((await countsRes.json()) as { counts: Record<string, number> }).counts
        : {};
      // Mapa slug → riesgo (degrada silencioso si churn falla).
      const riskBySlug = new Map<string, TenantRow["risk"]>();
      if (churnRes.ok) {
        try {
          const cj = (await churnRes.json()) as {
            tenants: { slug: string; healthScore?: { score: number; riskLevel: string; trialDaysLeft: number | null; daysSinceLastLogin: number | null }; activeSignals?: unknown[] }[];
          };
          for (const c of cj.tenants ?? []) {
            if (!c.healthScore) continue;
            riskBySlug.set(c.slug, {
              score: c.healthScore.score,
              level: (c.healthScore.riskLevel as "low" | "medium" | "high" | "critical") ?? "low",
              trialDaysLeft: c.healthScore.trialDaysLeft,
              daysSinceLastLogin: c.healthScore.daysSinceLastLogin,
              signals: Array.isArray(c.activeSignals) ? c.activeSignals.length : 0,
            });
          }
        } catch { /* churn opcional */ }
      }
      // Aplicamos pendingOrders fresh + riesgo sobre el listado cacheado.
      const merged = data.tenants.map((t) => ({
        ...t,
        pendingOrders: (counts[t.id] ?? 0) + (counts[t.slug] ?? 0),
        risk: riskBySlug.get(t.slug) ?? null,
      }));
      setTenants(merged);
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  // Counts de módulos forzados por tenant — pinta la columna "Módulos" de la
  // vista lista (1 request bulk, no N por fila).
  const loadModuleOverrideCounts = useCallback(async () => {
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/module-overrides");
      if (!res.ok) return;
      const data = (await res.json()) as { counts: Record<string, number> };
      setModuleOverrideCounts(data.counts ?? {});
    } catch { /* silencioso — columna muestra "Plantilla" */ }
  }, []);
  useEffect(() => { void loadModuleOverrideCounts(); }, [loadModuleOverrideCounts]);

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
  const stats = useMemo(() => {
    const activeCount = tenants.filter((t) => t.active).length;
    const trialCount = tenants.filter(
      (t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date(),
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
  type QuickFilter = "all" | "active" | "inactive" | "pro" | "enterprise" | "trial" | "pending" | "trial-expiring" | "overwhelmed" | "stale" | "at-risk";
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
  type Health = "healthy" | "warning" | "critical";
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
  type AlertItem = {
    id: string;
    icon: LucideIcon;
    tone: "amber" | "rose" | "sky";
    label: string;
    count: number;
    onClick: () => void;
  };
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = [];
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

  // ── Bulk selection — modo selección para acciones masivas ────────────
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
  }, [tenants, selectedIds]);

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
    showToast(`Plan → ${plan} en ${list.length} tienda(s)`, true);
    clearSelection();
  }, [tenants, selectedIds, handlePlanChange, showToast, clearSelection]);
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
      return sorted.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date());
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

  return (
    <AdminTabShell
      title="Tenants"
      description={`${sortedFinal.length} tienda${sortedFinal.length !== 1 ? "s" : ""}${tenants.length !== sortedFinal.length ? ` de ${tenants.length}` : ""} — gestión de plataforma multi-tenant.`}
      icon={Building2}
      kicker="Plataforma multi-tenant"
    >
      {/* ═══════ FILA 1 · Stats hero (4 KPI) ════════════════════════════
            Brandon 2026-05-21 audit fix #3: durante loading inicial, en vez
            de mostrar "0 / S/0 / 0 / 0" (que confunde al user haciéndole
            creer que no hay tenants), mostramos "—" placeholder. Cuando el
            fetch termina, el valor real se renderea. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAStatChip
          icon={Building2}
          label="Total tenants"
          value={loading ? "—" : String(stats.total)}
          hint={loading ? "Cargando…" : `${stats.active} activos · ${stats.inactive} suspendidos`}
          tone="teal"
        />
        <SAStatChip
          icon={DollarSign}
          // Brandon 2026-05-21 audit fix #5: antes "MRR consolidado" confundía
          // con el MRR del dashboard ejecutivo (que es la SUSCRIPCIÓN SaaS
          // que pagan los tenants a Buleje). ESTE valor es GMV: la suma del
          // revenue REAL que generaron las tiendas vendiendo en el mes.
          // Son cosas distintas — clarificado en label y hint.
          label="GMV marketplaces"
          value={loading ? "—" : `S/ ${stats.mrr.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
          hint={loading ? "Cargando…" : "Ventas brutas de tiendas (mes)"}
          tone="emerald"
        />
        <SAStatChip
          icon={Sparkles}
          label="En trial"
          value={loading ? "—" : String(stats.trial)}
          hint={loading ? "Cargando…" : stats.trial > 0 ? "Vencen pronto" : "Sin trials activos"}
          tone="violet"
        />
        <SAStatChip
          icon={Bell}
          label="Pedidos pendientes"
          value={loading ? "—" : String(stats.pendingTotal)}
          hint={loading ? "Cargando…" : `En ${stats.tenantsWithPending} tienda${stats.tenantsWithPending === 1 ? "" : "s"}`}
          tone={stats.pendingTotal > 0 ? "amber" : "sky"}
        />
      </div>

      {/* ═══════ FILA 2 · Alertas colapsables (1 línea cuando hay) ══════ */}
      {alerts.length > 0 && (
        <AlertsBanner alerts={alerts} />
      )}

      {/* ═══════ FILA 3 · Sticky toolbar — Brandon 2026-05-21 high-impact:
            con 6+ tenants el user scrollea mucho y pierde de vista search
            + filters. Sticky top con backdrop-blur preserva visibilidad sin
            perder espacio visual. `-mx-4 sm:-mx-6 px-4 sm:px-6` extiende
            al edge para que el blur cubra todo el ancho del main content. */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[var(--surface-canvas)]/85 backdrop-blur-md border-b border-[var(--rule-soft)] flex flex-col lg:flex-row lg:items-center gap-3">
        {/* Crecimiento ahora vive en su propia página (Brandon 2026-06-14). */}
        <Link
          href="/superadmin/tenants/growth"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors shrink-0"
        >
          <TrendingUp className="w-3.5 h-3.5" /> Ver crecimiento
        </Link>

        {(
          <>
            {/* Search wide — flex-1 toma todo el espacio disponible.
                Brandon 2026-05-21 high-impact: ref para "/" shortcut +
                hint badge en desktop indicando el atajo (UX power-user). */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, slug o email…"
                aria-label="Buscar tenants (atajo: tecla /)"
                className="w-full h-10 pl-10 pr-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
              />
              <kbd
                aria-hidden
                className="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center justify-center h-6 px-1.5 rounded border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[10px] font-bold text-[var(--text-tertiary)] pointer-events-none"
              >
                /
              </kbd>
            </div>

            {/* Sort dropdown — compact */}
            <div className="relative shrink-0">
              <select
                value={`${sortField}-${sortDir}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split("-") as [SortField, SortDir];
                  setSortField(field); setSortDir(dir);
                }}
                className={`${selectCls} h-10 pl-3 text-sm font-semibold`}
                aria-label="Orden"
              >
                <option value="createdAt-desc">Recientes ↓</option>
                <option value="createdAt-asc">Antiguos ↑</option>
                <option value="name-asc">Nombre A→Z</option>
                <option value="name-desc">Nombre Z→A</option>
                <option value="ordersThisMonth-desc">+ Pedidos</option>
                <option value="ordersThisMonth-asc">− Pedidos</option>
                <option value="plan-asc">Por plan</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
            </div>

            {/* View toggle — tabla · tarjetas · compacta (densidad alta) */}
            <div className="flex items-center bg-[var(--surface-sunken)] rounded-xl p-1 shrink-0">
              <button type="button" onClick={() => setViewMode("table")} title="Vista tabla"
                aria-pressed={viewMode === "table"}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>
                <List className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setViewMode("cards")} title="Vista tarjetas"
                aria-pressed={viewMode === "cards"}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "cards" ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setViewMode("compact")} title="Vista compacta — más tiendas en menos espacio"
                aria-pressed={viewMode === "compact"}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "compact" ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>
                <Grid3x3 className="w-4 h-4" />
              </button>
            </div>

            {/* Acciones agrupadas — bulk select + actualizar + bomba */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => { setBulkMode((m) => !m); if (bulkMode) setSelectedIds(new Set()); }}
                title={bulkMode ? "Salir del modo selección" : "Modo selección"}
                className={`inline-flex items-center justify-center h-10 w-10 rounded-xl border-2 transition-colors ${
                  bulkMode
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
                aria-label={bulkMode ? "Salir de selección" : "Activar selección"}
              >
                {bulkMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => void loadTenants()}
                disabled={loading}
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                aria-label="Actualizar"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setNuclearResetOpen(true)}
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 transition-colors"
                aria-label="Reinicio total del sistema (acción destructiva)"
                title="Mantenimiento — reinicio total"
              >
                <Bomb className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tab: Tiendas */}
      {(
        <>
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

          {/* Empty state compartido por cards + compacta */}
          {!loading && viewMode !== "table" && sortedFinal.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] py-16 px-6 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-[var(--text-tertiary)] opacity-50" />
              <p className="text-base font-bold text-[var(--text-primary)]">
                {tenants.length === 0 ? "Sin tenants registrados" : "Sin coincidencias con los filtros"}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                {tenants.length === 0
                  ? "Aún no hay ningún tenant en la plataforma."
                  : "Probá ajustar la búsqueda, plan o estado."}
              </p>
              {tenants.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); applyQuickFilter("all"); }}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {/* Vista tarjetas — health integrado en el kicker de la card
              (Brandon 2026-06-05: antes era un badge absoluto que se
              superponía con los badges propios de la card). */}
          {!loading && viewMode === "cards" && sortedFinal.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {sortedFinal.map((tenant) => {
                const isSelected = selectedIds.has(tenant.id);
                return (
                  <div key={tenant.id} className="relative">
                    {/* Checkbox flotante cuando bulk mode activo */}
                    {bulkMode && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(tenant.id)}
                        className={`absolute top-3 left-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--accent)]"
                        }`}
                        aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    )}

                    <div className={isSelected ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)] rounded-2xl" : ""}>
                      <TenantCard
                        tenant={tenant}
                        health={getHealth(tenant)}
                        onDetail={(t) => setDetailTarget(t)}
                        onInvite={(slug, name) => setInviteTarget({ slug, name })}
                        onToggleActive={(slug, active) => void handleToggleActive(slug, active)}
                        actionLoading={actionLoading}
                        onImpersonate={(slug) => void handleImpersonate(slug)}
                        onToggleMarketplace={(t) => void handleToggleMarketplace(t)}
                        onLoginAs={(t) => handleLoginAs(t)}
                        onViewProducts={(t) => setProductsTarget({ slug: t.slug, name: t.name })}
                        onAddProduct={(t) => setAddProductTarget({ slug: t.slug, name: t.name })}
                        onDelete={(slug, name) => setDeleteTarget({ slug, name })}
                        onPurge={(slug, name) => void handlePurgeTenant(slug, name)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Vista compacta — mini-cards densas: identidad + pendientes +
              ventas + trial. Click → detalle; flecha → panel admin. */}
          {!loading && viewMode === "compact" && sortedFinal.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {sortedFinal.map((tenant) => {
                const isSelected = selectedIds.has(tenant.id);
                return (
                  <div key={tenant.id} className="relative">
                    {bulkMode && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(tenant.id)}
                        className={`absolute -top-2 -left-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--accent)]"
                        }`}
                        aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    )}
                    <div className={isSelected ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-canvas)] rounded-xl" : ""}>
                      <TenantCardCompact
                        tenant={tenant}
                        health={getHealth(tenant)}
                        onDetail={(t) => setDetailTarget(t)}
                        onImpersonate={(slug) => void handleImpersonate(slug)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
        </>
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

      {/* ═══════ Barra flotante de acciones masivas ════════════════════ */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] shadow-2xl shadow-[var(--accent)]/20 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] pr-2 border-r border-[var(--rule-soft)]">
            <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              // Seleccionar todos los visibles
              const allIds = new Set(sortedFinal.map((t) => t.id));
              setSelectedIds(allIds);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Seleccionar visibles ({sortedFinal.length})
          </button>
          <button
            type="button"
            onClick={handleBulkExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)] hover:brightness-110 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => setBulkMessageOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)] hover:brightness-110 transition-all"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Mensaje
          </button>
          {/* Acciones masivas (D2): plan · trial · suspender */}
          <select
            aria-label="Cambiar plan de la selección"
            defaultValue=""
            onChange={(e) => { const v = e.target.value as PlanId; if (v) { void bulkSetPlan(v); e.currentTarget.value = ""; } }}
            className="h-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)]"
          >
            <option value="">Plan…</option>
            <option value="free">→ Free</option>
            <option value="pro">→ Pro</option>
            <option value="business">→ Business</option>
            <option value="enterprise">→ Enterprise</option>
          </select>
          <button
            type="button"
            onClick={() => void bulkExtendTrial()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0d9488] hover:bg-[#0d9488] transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Trial +14d
          </button>
          <button
            type="button"
            onClick={() => void bulkSuspend()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-error-600,#dc2626)] hover:bg-[var(--data-error-50,#fef2f2)] transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Suspender
          </button>
          <button
            type="button"
            onClick={() => {
              const emails = tenants
                .filter((t) => selectedIds.has(t.id) && t.ownerEmail)
                .map((t) => t.ownerEmail)
                .join(",");
              if (emails) {
                window.location.href = `mailto:?bcc=${emails}`;
              } else {
                showToast("Los tenants seleccionados no tienen email registrado", false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            title="Cerrar selección"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
  );
}

// Audit P1 (2026-05-19): `TenantStat` y su TONE map se extrajeron a
// `_shared/SAStatChip` (componente canónico del superadmin). Importado arriba.

// ── AlertsBanner — colapsable, 1 línea cuando hay alertas ──────────────
type AlertItemShape = {
  id: string;
  icon: LucideIcon;
  tone: "amber" | "rose" | "sky";
  label: string;
  count: number;
  onClick: () => void;
};

function AlertsBanner({ alerts }: { alerts: AlertItemShape[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = alerts.reduce((s, a) => s + a.count, 0);
  const worstTone = alerts.some((a) => a.tone === "rose")
    ? "rose"
    : alerts.some((a) => a.tone === "amber")
      ? "amber"
      : "sky";
  const toneCls = {
    amber: "border-teal-500/40 bg-teal-500/8 text-teal-700 dark:text-teal-300",
    rose: "border-rose-500/40 bg-rose-500/8 text-rose-700 dark:text-rose-300",
    sky: "border-sky-500/40 bg-sky-500/8 text-sky-700 dark:text-sky-300",
  }[worstTone];

  return (
    <div className={`rounded-xl border-2 ${toneCls}`}>
      {/* Header colapsable — 1 línea con summary */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/40 dark:bg-black/20">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold flex-1 min-w-0 truncate">
          {alerts.length === 1
            ? alerts[0].label
            : `${alerts.length} problemas detectados · ${totalCount} tienda${totalCount === 1 ? "" : "s"} afectada${totalCount === 1 ? "" : "s"}`}
        </span>
        {alerts.length > 1 && (
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {/* Items expandidos — uno por línea cuando hay más de 1 */}
      {expanded && alerts.length > 1 && (
        <div className="border-t border-current/20 px-3 py-2 space-y-1">
          {alerts.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => { a.onClick(); setExpanded(false); }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-black/20 text-left"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-semibold flex-1 min-w-0 truncate">{a.label}</span>
                <span className="shrink-0 inline-flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-white/60 dark:bg-black/30 text-[10px] font-bold tabular-nums">
                  {a.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── QuickFilters — 4 chips principales + "Más ▾" para Plan/Estado ──────
function QuickFilters({
  quickFilter,
  applyQuickFilter,
  stats,
  filterPlan,
  setFilterPlan,
  filterActive,
  setFilterActive,
}: {
  quickFilter: string;
  applyQuickFilter: (v: "all" | "active" | "inactive" | "pro" | "enterprise" | "trial" | "pending" | "at-risk") => void;
  stats: { total: number; active: number; inactive: number; trial: number; tenantsWithPending: number; atRisk: number; byPlan: Record<PlanId, number> };
  filterPlan: "all" | PlanId;
  setFilterPlan: (v: "all" | PlanId) => void;
  filterActive: "all" | "active" | "inactive";
  setFilterActive: (v: "all" | "active" | "inactive") => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const principalChips = [
    { id: "all" as const,      label: "Todos",          count: stats.total },
    { id: "active" as const,   label: "Activas",        count: stats.active },
    { id: "trial" as const,    label: "En trial",       count: stats.trial },
    { id: "at-risk" as const,  label: "En riesgo",      count: stats.atRisk },
    { id: "pending" as const,  label: "Con pendientes", count: stats.tenantsWithPending },
  ];
  const isMoreActive =
    filterPlan !== "all" ||
    filterActive === "inactive" ||
    quickFilter === "pro" ||
    quickFilter === "enterprise" ||
    quickFilter === "inactive";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {principalChips.map((qf) => {
        const isActive = quickFilter === qf.id;
        return (
          <button
            key={qf.id}
            type="button"
            onClick={() => applyQuickFilter(qf.id)}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
              isActive
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {qf.label}
            <span className={`tabular-nums font-bold ${isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
              {qf.count}
            </span>
          </button>
        );
      })}

      {/* "Más ▾" — popover con plan + estado granulares */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
            isMoreActive || moreOpen
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          }`}
          aria-expanded={moreOpen}
        >
          Más filtros
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {moreOpen && (
          <>
            {/* Backdrop para cerrar al clickear afuera */}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-10"
              tabIndex={-1}
            />
            <div className="absolute z-20 mt-2 right-0 sm:left-0 sm:right-auto w-64 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl p-3 space-y-3">
              {/* Plan */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                  Plan
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "free", "pro", "business", "enterprise"] as const).map((p) => {
                    const label = p === "all" ? "Todos" : p === "free" ? "Gratis" : p === "business" ? "Enterprise" : p === "enterprise" ? "Max" : "Pro";
                    const count = p === "all" ? stats.total : stats.byPlan[p as PlanId] ?? 0;
                    const isActive = filterPlan === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFilterPlan(p)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
                        }`}
                      >
                        {label}
                        <span className={`tabular-nums text-[10px] ${isActive ? "text-white/80" : "text-[var(--text-tertiary)]"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Estado */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                  Estado
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: "all", label: "Todos", count: stats.total },
                    { id: "active", label: "Activas", count: stats.active },
                    { id: "inactive", label: "Suspendidas", count: stats.inactive },
                  ] as const).map((s) => {
                    const isActive = filterActive === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFilterActive(s.id)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
                        }`}
                      >
                        {s.label}
                        <span className={`tabular-nums text-[10px] ${isActive ? "text-white/80" : "text-[var(--text-tertiary)]"}`}>
                          {s.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// TenantStat eliminado — reemplazado por <SAStatChip> de _shared.
