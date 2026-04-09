/**
 * /superadmin/roadmap
 *
 * Módulo Roadmap del superadmin — 84 items consolidados del Master Roadmap
 * 2026-04-09. Contenido estático en lib/roadmap/items.ts, estado mutable en
 * RoadmapItemStatus (DB).
 *
 * Auth: layout superadmin ya valida la sesión. Este archivo es un client
 * component que hace fetch al endpoint /api/superadmin/roadmap/items.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDashed,
  Clock,
  Filter,
  Loader2,
  Map as MapIcon,
  PauseCircle,
  RefreshCw,
  Search,
  Sparkles,
  SquareDashed,
  Target,
  X,
} from "lucide-react";
import type {
  RoadmapEffort,
  RoadmapItem,
  RoadmapPriority,
  RoadmapScope,
  RoadmapTier,
  RoadmapType,
} from "@/lib/roadmap/items";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type StatusValue = "planned" | "in_progress" | "done" | "blocked" | "skipped";

interface ItemState {
  status: StatusValue;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface MergedItem extends RoadmapItem {
  state: ItemState;
}

interface RoadmapStats {
  total: number;
  planned: number;
  in_progress: number;
  done: number;
  blocked: number;
  skipped: number;
  criticalBugs: number;
  criticalBugsDone: number;
}

interface RoadmapResponse {
  stats: RoadmapStats;
  items: MergedItem[];
}

// ────────────────────────────────────────────────────────────────────────────
// Visual tokens
// ────────────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<RoadmapTier, { bg: string; text: string; border: string; label: string }> = {
  S: {
    bg: "bg-gradient-to-br from-amber-400 to-yellow-500",
    text: "text-amber-900",
    border: "border-amber-400/60",
    label: "Tier S · Crítico",
  },
  A: {
    bg: "bg-gradient-to-br from-slate-300 to-slate-400",
    text: "text-slate-900",
    border: "border-slate-400/60",
    label: "Tier A · Estratégico",
  },
  B: {
    bg: "bg-gradient-to-br from-orange-300 to-amber-600",
    text: "text-orange-900",
    border: "border-amber-500/60",
    label: "Tier B · Complementario",
  },
  C: {
    bg: "bg-gradient-to-br from-gray-300 to-gray-500",
    text: "text-gray-900",
    border: "border-gray-400/60",
    label: "Tier C · Backlog",
  },
};

const PRIORITY_COLORS: Record<RoadmapPriority, string> = {
  P0: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40",
  P1: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/40",
  P2: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-500 border-yellow-500/40",
  P3: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40",
};

const EFFORT_COLORS: Record<RoadmapEffort, string> = {
  S: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40",
  M: "bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/40",
  L: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/40",
  XL: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/40",
};

const TYPE_EMOJI: Record<RoadmapType, string> = {
  fix: "🐛",
  new: "🆕",
  expansion: "📈",
  complete: "✅",
};

const TYPE_LABEL: Record<RoadmapType, string> = {
  fix: "Fix",
  new: "Nueva",
  expansion: "Expansión",
  complete: "Completar",
};

const SCOPE_LABEL: Record<RoadmapScope, string> = {
  marketplace: "Marketplace",
  admin: "Admin",
  superadmin: "Superadmin",
  store: "Tienda",
  "cross-cutting": "Transversal",
  "product-ux": "Product UX",
};

const SCOPE_COLOR: Record<RoadmapScope, string> = {
  marketplace: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30",
  admin: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  superadmin: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
  store: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  "cross-cutting": "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
  "product-ux": "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30",
};

const STATUS_META: Record<
  StatusValue,
  { label: string; emoji: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  planned: {
    label: "Planificado",
    emoji: "📋",
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
    icon: Circle,
  },
  in_progress: {
    label: "En progreso",
    emoji: "🔄",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40",
    icon: Loader2,
  },
  done: {
    label: "Hecho",
    emoji: "✅",
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
    icon: CheckCircle2,
  },
  blocked: {
    label: "Bloqueado",
    emoji: "🚧",
    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40",
    icon: PauseCircle,
  },
  skipped: {
    label: "Omitido",
    emoji: "⏭️",
    color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
    icon: SquareDashed,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Helper: toast
// ────────────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [tierFilter, setTierFilter] = useState<RoadmapTier | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<RoadmapScope | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<RoadmapPriority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusValue | "all">("all");
  const [search, setSearch] = useState("");

  // Collapsed tiers
  const [collapsedTiers, setCollapsedTiers] = useState<Set<RoadmapTier>>(new Set());

  // Modal
  const [detailItem, setDetailItem] = useState<MergedItem | null>(null);

  // Optimistic state bookkeeping
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Celebrate
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/roadmap/items", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`Error al cargar roadmap (${res.status})`);
        return;
      }
      const json = (await res.json()) as RoadmapResponse;
      setData(json);
    } catch (err) {
      setError("Error de red al cargar roadmap");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Update a single item's state (optimistic)
  const updateItem = useCallback(
    async (
      itemId: string,
      patch: { status?: StatusValue; progress?: number; notes?: string },
    ) => {
      if (!data) return;

      // Optimistic
      const originalItems = data.items;
      const nowIso = new Date().toISOString();
      const nextItems = originalItems.map((it) => {
        if (it.id !== itemId) return it;
        const prevState = it.state;
        return {
          ...it,
          state: {
            ...prevState,
            status: patch.status ?? prevState.status,
            progress: patch.progress ?? prevState.progress,
            notes:
              patch.notes !== undefined
                ? (prevState.notes ? `${prevState.notes}\n${patch.notes}` : patch.notes)
                : prevState.notes,
            updatedAt: nowIso,
          },
        } satisfies MergedItem;
      });

      // Recompute stats
      const nextStats: RoadmapStats = {
        total: data.stats.total,
        planned: 0,
        in_progress: 0,
        done: 0,
        blocked: 0,
        skipped: 0,
        criticalBugs: data.stats.criticalBugs,
        criticalBugsDone: 0,
      };
      for (const m of nextItems) {
        nextStats[m.state.status] += 1;
        if (m.isCriticalBug && m.state.status === "done") nextStats.criticalBugsDone += 1;
      }

      setData({ stats: nextStats, items: nextItems });
      setUpdatingIds((prev) => {
        const n = new Set(prev);
        n.add(itemId);
        return n;
      });

      // POST to API
      try {
        const res = await fetch(
          `/api/superadmin/roadmap/items/${encodeURIComponent(itemId)}/status`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errJson.error ?? `HTTP ${res.status}`);
        }
        pushToast("success", `Item actualizado: ${patch.status ?? "progreso"}`);

        if (patch.status === "done") {
          setCelebratingId(itemId);
          setTimeout(() => setCelebratingId(null), 2400);
        }
      } catch (err) {
        // Rollback
        setData({ stats: data.stats, items: originalItems });
        pushToast("error", `No se pudo actualizar: ${(err as Error).message}`);
      } finally {
        setUpdatingIds((prev) => {
          const n = new Set(prev);
          n.delete(itemId);
          return n;
        });
      }
    },
    [data, pushToast],
  );

  // Filter items
  const filteredItems = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.items.filter((it) => {
      if (tierFilter !== "all" && it.tier !== tierFilter) return false;
      if (scopeFilter !== "all" && it.scope !== scopeFilter) return false;
      if (priorityFilter !== "all" && it.priority !== priorityFilter) return false;
      if (statusFilter !== "all" && it.state.status !== statusFilter) return false;
      if (term) {
        const hay =
          `${it.title} ${it.description} ${it.impact} ${it.id}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, tierFilter, scopeFilter, priorityFilter, statusFilter, search]);

  // Group filtered by tier
  const groupedByTier = useMemo(() => {
    const groups: Record<RoadmapTier, MergedItem[]> = { S: [], A: [], B: [], C: [] };
    for (const it of filteredItems) groups[it.tier].push(it);
    return groups;
  }, [filteredItems]);

  const toggleTier = (tier: RoadmapTier) => {
    setCollapsedTiers((prev) => {
      const n = new Set(prev);
      if (n.has(tier)) n.delete(tier);
      else n.add(tier);
      return n;
    });
  };

  const criticalBugs = useMemo(
    () => (data ? data.items.filter((it) => it.isCriticalBug) : []),
    [data],
  );

  const progressPct = data ? Math.round((data.stats.done / data.stats.total) * 100) : 0;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h2 className="text-red-700 dark:text-red-300 font-semibold mb-2">Error al cargar</h2>
        <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 pb-16">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/20">
              <MapIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Roadmap
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                84 mejoras consolidadas · Research 2026-04-09
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>

      {/* ─── Big stats bar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <StatBlock
          label="Total"
          value={data.stats.total}
          accent="from-teal-500 to-teal-600"
          icon={<Target className="w-4 h-4" />}
        />
        <StatBlock
          label="Hecho"
          value={data.stats.done}
          sub={`${progressPct}%`}
          accent="from-emerald-500 to-green-600"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatBlock
          label="En progreso"
          value={data.stats.in_progress}
          accent="from-blue-500 to-indigo-600"
          icon={<Loader2 className="w-4 h-4" />}
        />
        <StatBlock
          label="Planificado"
          value={data.stats.planned}
          accent="from-gray-400 to-gray-500"
          icon={<CircleDashed className="w-4 h-4" />}
        />
        <StatBlock
          label="Bloqueado"
          value={data.stats.blocked}
          accent="from-red-500 to-rose-600"
          icon={<PauseCircle className="w-4 h-4" />}
        />
      </div>

      {/* ─── Global progress bar ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Progreso global
            </span>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
            {data.stats.done} / {data.stats.total}
            <span className="ml-2 font-bold text-teal-600 dark:text-teal-400">
              {progressPct}%
            </span>
          </span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ─── Critical bugs hero ─────────────────────────────────────────── */}
      {criticalBugs.length > 0 && (
        <CriticalBugsHero
          bugs={criticalBugs}
          doneCount={data.stats.criticalBugsDone}
          onOpenDetail={(it) => setDetailItem(it)}
          onMarkDone={(id) => updateItem(id, { status: "done", progress: 100 })}
          onMarkInProgress={(id) => updateItem(id, { status: "in_progress", progress: 25 })}
          updatingIds={updatingIds}
        />
      )}

      {/* ─── Filters ─────────────────────────────────────────────────────── */}
      <FilterBar
        tierFilter={tierFilter}
        onTierChange={setTierFilter}
        scopeFilter={scopeFilter}
        onScopeChange={setScopeFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        totalResults={filteredItems.length}
      />

      {/* ─── Items grouped by tier ──────────────────────────────────────── */}
      <div className="space-y-8">
        {(["S", "A", "B", "C"] as RoadmapTier[]).map((tier) => {
          const items = groupedByTier[tier];
          if (items.length === 0) return null;
          const collapsed = collapsedTiers.has(tier);
          return (
            <TierSection
              key={tier}
              tier={tier}
              items={items}
              collapsed={collapsed}
              onToggle={() => toggleTier(tier)}
              onOpenDetail={(it) => setDetailItem(it)}
              onChangeStatus={(id, status) =>
                updateItem(id, {
                  status,
                  progress:
                    status === "done"
                      ? 100
                      : status === "in_progress"
                        ? 25
                        : status === "planned"
                          ? 0
                          : undefined,
                })
              }
              updatingIds={updatingIds}
              celebratingId={celebratingId}
            />
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
            <Filter className="w-10 h-10 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              No hay items que coincidan con los filtros
            </p>
            <button
              type="button"
              onClick={() => {
                setTierFilter("all");
                setScopeFilter("all");
                setPriorityFilter("all");
                setStatusFilter("all");
                setSearch("");
              }}
              className="mt-3 text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* ─── Detail modal ────────────────────────────────────────────────── */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onChangeStatus={(status) =>
            updateItem(detailItem.id, {
              status,
              progress:
                status === "done"
                  ? 100
                  : status === "in_progress"
                    ? 25
                    : status === "planned"
                      ? 0
                      : undefined,
            })
          }
          onAddNote={(note) => updateItem(detailItem.id, { notes: note })}
          updating={updatingIds.has(detailItem.id)}
        />
      )}

      {/* ─── Toasts ──────────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-sm font-medium backdrop-blur-md max-w-sm",
              t.kind === "success"
                ? "bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900"
                : t.kind === "error"
                  ? "bg-red-50/95 dark:bg-red-950/90 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900"
                  : "bg-blue-50/95 dark:bg-blue-950/90 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900",
            ].join(" ")}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ─── Celebration overlay ─────────────────────────────────────────── */}
      {celebratingId && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="animate-ping absolute inline-flex h-48 w-48 rounded-full bg-emerald-400/40" />
          <div className="relative bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-800 rounded-2xl px-6 py-4 shadow-2xl text-center">
            <div className="text-4xl mb-1">🎉</div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              ¡Item completado!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: number;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 overflow-hidden shadow-sm">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
        {icon}
        {label}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
          {value}
        </div>
        {sub && (
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 tabular-nums">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function CriticalBugsHero({
  bugs,
  doneCount,
  onOpenDetail,
  onMarkDone,
  onMarkInProgress,
  updatingIds,
}: {
  bugs: MergedItem[];
  doneCount: number;
  onOpenDetail: (item: MergedItem) => void;
  onMarkDone: (id: string) => void;
  onMarkInProgress: (id: string) => void;
  updatingIds: Set<string>;
}) {
  const total = bugs.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="relative bg-gradient-to-br from-red-500/10 via-orange-500/5 to-red-500/10 dark:from-red-950/50 dark:via-red-900/30 dark:to-red-950/50 border-2 border-red-500/40 dark:border-red-900 rounded-3xl p-6 overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 animate-pulse" />
            <h2 className="text-lg font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">
              Bugs Críticos
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
              {doneCount}/{total}
            </span>
          </div>
          <p className="text-sm text-red-700/80 dark:text-red-300/80">
            Arreglos de máxima prioridad — están corrompiendo data o reportando
            números falsos hoy mismo.
          </p>
        </div>
        <div className="flex-shrink-0 w-32">
          <div className="text-right text-xs text-red-700 dark:text-red-300 font-semibold mb-1 tabular-nums">
            {pct}%
          </div>
          <div className="h-2 bg-red-200 dark:bg-red-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 relative">
        {bugs.map((bug) => {
          const isDone = bug.state.status === "done";
          const isInProgress = bug.state.status === "in_progress";
          const isUpdating = updatingIds.has(bug.id);
          return (
            <div
              key={bug.id}
              className={[
                "bg-white/80 dark:bg-gray-900/80 backdrop-blur border rounded-2xl p-4 shadow-sm transition-all",
                isDone
                  ? "border-emerald-500/40 opacity-70"
                  : "border-red-500/30 hover:border-red-500/60",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => onOpenDetail(bug)}
                  className="text-left flex-1 min-w-0"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">
                      #{bug.number}
                    </span>
                    <StatusPill status={bug.state.status} compact />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2">
                    {bug.title}
                  </h3>
                </button>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                {bug.impact}
              </p>

              {!isDone && (
                <div className="flex items-center gap-1.5">
                  {!isInProgress && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => onMarkInProgress(bug.id)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>🔥 Arreglar ahora</>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onMarkDone(bug.id)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Hecho
                  </button>
                </div>
              )}
              {isDone && (
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completado
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterBar({
  tierFilter,
  onTierChange,
  scopeFilter,
  onScopeChange,
  priorityFilter,
  onPriorityChange,
  statusFilter,
  onStatusChange,
  search,
  onSearchChange,
  totalResults,
}: {
  tierFilter: RoadmapTier | "all";
  onTierChange: (v: RoadmapTier | "all") => void;
  scopeFilter: RoadmapScope | "all";
  onScopeChange: (v: RoadmapScope | "all") => void;
  priorityFilter: RoadmapPriority | "all";
  onPriorityChange: (v: RoadmapPriority | "all") => void;
  statusFilter: StatusValue | "all";
  onStatusChange: (v: StatusValue | "all") => void;
  search: string;
  onSearchChange: (v: string) => void;
  totalResults: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Filtros
        </span>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {totalResults} items
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por título, descripción, impacto..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
        />
      </div>

      {/* Filter chip groups */}
      <div className="space-y-3">
        <FilterChipGroup
          label="Tier"
          value={tierFilter}
          onChange={onTierChange as (v: string) => void}
          options={[
            { v: "all", l: "Todos" },
            { v: "S", l: "S · Crítico" },
            { v: "A", l: "A · Estratégico" },
            { v: "B", l: "B · Complementario" },
            { v: "C", l: "C · Backlog" },
          ]}
        />
        <FilterChipGroup
          label="Alcance"
          value={scopeFilter}
          onChange={onScopeChange as (v: string) => void}
          options={[
            { v: "all", l: "Todos" },
            { v: "marketplace", l: "Marketplace" },
            { v: "admin", l: "Admin" },
            { v: "superadmin", l: "Superadmin" },
            { v: "store", l: "Tienda" },
            { v: "cross-cutting", l: "Transversal" },
            { v: "product-ux", l: "Product UX" },
          ]}
        />
        <FilterChipGroup
          label="Prioridad"
          value={priorityFilter}
          onChange={onPriorityChange as (v: string) => void}
          options={[
            { v: "all", l: "Todas" },
            { v: "P0", l: "P0" },
            { v: "P1", l: "P1" },
            { v: "P2", l: "P2" },
            { v: "P3", l: "P3" },
          ]}
        />
        <FilterChipGroup
          label="Estado"
          value={statusFilter}
          onChange={onStatusChange as (v: string) => void}
          options={[
            { v: "all", l: "Todos" },
            { v: "planned", l: "📋 Planificado" },
            { v: "in_progress", l: "🔄 En progreso" },
            { v: "done", l: "✅ Hecho" },
            { v: "blocked", l: "🚧 Bloqueado" },
            { v: "skipped", l: "⏭️ Omitido" },
          ]}
        />
      </div>
    </div>
  );
}

function FilterChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-20 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              className={[
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                active
                  ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                  : "bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-teal-500/50",
              ].join(" ")}
            >
              {opt.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TierSection({
  tier,
  items,
  collapsed,
  onToggle,
  onOpenDetail,
  onChangeStatus,
  updatingIds,
  celebratingId,
}: {
  tier: RoadmapTier;
  items: MergedItem[];
  collapsed: boolean;
  onToggle: () => void;
  onOpenDetail: (item: MergedItem) => void;
  onChangeStatus: (id: string, status: StatusValue) => void;
  updatingIds: Set<string>;
  celebratingId: string | null;
}) {
  const tokens = TIER_COLORS[tier];
  const doneCount = items.filter((it) => it.state.status === "done").length;

  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 mb-4 group"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl ${tokens.bg} flex items-center justify-center shadow-md`}
          >
            <span className={`text-lg font-bold ${tokens.text}`}>{tier}</span>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {tokens.label}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {items.length} items · {doneCount} hechos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
            {collapsed ? "Expandir" : "Colapsar"}
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onOpenDetail={() => onOpenDetail(item)}
              onChangeStatus={(s) => onChangeStatus(item.id, s)}
              isUpdating={updatingIds.has(item.id)}
              isCelebrating={celebratingId === item.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ItemCard({
  item,
  onOpenDetail,
  onChangeStatus,
  isUpdating,
  isCelebrating,
}: {
  item: MergedItem;
  onOpenDetail: () => void;
  onChangeStatus: (s: StatusValue) => void;
  isUpdating: boolean;
  isCelebrating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsExpand = item.description.length > 180;

  return (
    <article
      className={[
        "group relative bg-white dark:bg-gray-900 border rounded-2xl p-4 shadow-sm hover:shadow-lg transition-all",
        isCelebrating
          ? "border-emerald-500 ring-4 ring-emerald-400/30 animate-pulse"
          : item.state.status === "done"
            ? "border-emerald-300/50 dark:border-emerald-800/50 opacity-80"
            : "border-gray-200 dark:border-gray-800 hover:border-teal-500/40",
      ].join(" ")}
    >
      {/* Top bar: number + type + priority + effort + status */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">
          #{item.number}
        </span>
        <span title={TYPE_LABEL[item.type]} className="text-sm" aria-label={TYPE_LABEL[item.type]}>
          {TYPE_EMOJI[item.type]}
        </span>
        <TierBadge tier={item.tier} />
        <ScopeBadge scope={item.scope} />
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold tabular-nums ${PRIORITY_COLORS[item.priority]}`}
        >
          {item.priority}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${EFFORT_COLORS[item.effort]}`}
        >
          {item.effort}
        </span>
        <div className="ml-auto">
          <StatusPill status={item.state.status} compact />
        </div>
      </div>

      {/* Title */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="text-left w-full"
      >
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1.5 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
          {item.title}
        </h3>
      </button>

      {/* Description */}
      <p
        className={`text-xs text-gray-600 dark:text-gray-400 mb-2 whitespace-pre-line ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {item.description}
      </p>
      {needsExpand && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline mb-2"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}

      {/* Impact */}
      <div className="mb-3 flex items-start gap-1.5 p-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/40 dark:border-teal-900/40">
        <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-teal-800 dark:text-teal-300 leading-snug">
          {item.impact}
        </p>
      </div>

      {/* Progress bar (only if in_progress) */}
      {item.state.status === "in_progress" && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-semibold">
            <span>Progreso</span>
            <span className="tabular-nums">{item.state.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${item.state.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <StatusDropdown
          value={item.state.status}
          onChange={onChangeStatus}
          disabled={isUpdating}
        />
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold transition-colors"
        >
          Detalle
        </button>
        {isUpdating && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-1" />
        )}
      </div>

      {/* Footer: research file */}
      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
        <BarChart3 className="w-2.5 h-2.5" />
        <span className="truncate" title={item.researchFile}>
          {item.researchFile.replace("-2026-04-09.md", "")}
        </span>
      </div>
    </article>
  );
}

function StatusPill({ status, compact = false }: { status: StatusValue; compact?: boolean }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border font-bold",
        meta.color,
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
      ].join(" ")}
    >
      <Icon className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {meta.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: RoadmapTier }) {
  const t = TIER_COLORS[tier];
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${t.bg} ${t.text}`}
    >
      {tier}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: RoadmapScope }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${SCOPE_COLOR[scope]}`}
    >
      {SCOPE_LABEL[scope]}
    </span>
  );
}

function StatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: StatusValue;
  onChange: (v: StatusValue) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as StatusValue)}
      className={[
        "text-[11px] px-2 py-1.5 rounded-lg border font-semibold cursor-pointer transition-colors disabled:opacity-50",
        STATUS_META[value].color,
      ].join(" ")}
      aria-label="Cambiar estado"
    >
      <option value="planned">📋 Planificado</option>
      <option value="in_progress">🔄 En progreso</option>
      <option value="done">✅ Hecho</option>
      <option value="blocked">🚧 Bloqueado</option>
      <option value="skipped">⏭️ Omitido</option>
    </select>
  );
}

function DetailModal({
  item,
  onClose,
  onChangeStatus,
  onAddNote,
  updating,
}: {
  item: MergedItem;
  onClose: () => void;
  onChangeStatus: (s: StatusValue) => void;
  onAddNote: (note: string) => void;
  updating: boolean;
}) {
  const [noteInput, setNoteInput] = useState("");

  const handleAddNote = () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNoteInput("");
  };

  // Handle Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-10 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-3xl w-full shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md z-10 rounded-t-3xl">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">
                #{item.number}
              </span>
              <span className="text-lg" aria-label={TYPE_LABEL[item.type]}>
                {TYPE_EMOJI[item.type]}
              </span>
              <TierBadge tier={item.tier} />
              <ScopeBadge scope={item.scope} />
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${PRIORITY_COLORS[item.priority]}`}
              >
                {item.priority}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${EFFORT_COLORS[item.effort]}`}
              >
                Esfuerzo {item.effort}
              </span>
              {item.isCriticalBug && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-600 text-white font-bold animate-pulse">
                  🔴 BUG CRÍTICO
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {item.title}
          </h2>
          <StatusPill status={item.state.status} />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Description */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Descripción
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
              {item.description}
            </p>
          </section>

          {/* Impact */}
          <section className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900">
            <h3 className="text-xs font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Impacto esperado
            </h3>
            <p className="text-sm text-teal-900 dark:text-teal-100 font-medium">
              {item.impact}
            </p>
          </section>

          {/* Meta grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetaCell label="Tier" value={item.tier} />
            <MetaCell label="Prioridad" value={item.priority} />
            <MetaCell label="Esfuerzo" value={item.effort} />
            <MetaCell label="Alcance" value={SCOPE_LABEL[item.scope]} />
          </section>

          {/* Dependencies */}
          {item.dependencies.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Depende de
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {item.dependencies.map((dep) => (
                  <span
                    key={dep}
                    className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Research source */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Archivo de research
            </h3>
            <code className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-mono">
              docs/research/{item.researchFile}
            </code>
          </section>

          {/* Timestamps */}
          {(item.state.startedAt || item.state.completedAt || item.state.updatedAt) && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {item.state.startedAt && (
                <MetaCell
                  label="Iniciado"
                  value={new Date(item.state.startedAt).toLocaleString("es-PE")}
                />
              )}
              {item.state.completedAt && (
                <MetaCell
                  label="Completado"
                  value={new Date(item.state.completedAt).toLocaleString("es-PE")}
                />
              )}
              {item.state.updatedAt && (
                <MetaCell
                  label="Última mod."
                  value={new Date(item.state.updatedAt).toLocaleString("es-PE")}
                />
              )}
            </section>
          )}

          {/* Notes history */}
          {item.state.notes && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Historial de notas
              </h3>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 max-h-48 overflow-auto font-mono">
                {item.state.notes}
              </pre>
            </section>
          )}

          {/* Add note */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Agregar nota
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNote();
                }}
                placeholder="Ej: Esperando respuesta de Stripe support..."
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={updating || !noteInput.trim()}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                Agregar
              </button>
            </div>
          </section>
        </div>

        {/* Footer: action buttons */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md rounded-b-3xl">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Cambiar estado
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <ActionButton
              label="Planificado"
              icon="📋"
              active={item.state.status === "planned"}
              onClick={() => onChangeStatus("planned")}
              disabled={updating}
            />
            <ActionButton
              label="En progreso"
              icon="🔄"
              active={item.state.status === "in_progress"}
              onClick={() => onChangeStatus("in_progress")}
              disabled={updating}
            />
            <ActionButton
              label="Hecho"
              icon="✅"
              active={item.state.status === "done"}
              onClick={() => onChangeStatus("done")}
              disabled={updating}
            />
            <ActionButton
              label="Bloqueado"
              icon="🚧"
              active={item.state.status === "blocked"}
              onClick={() => onChangeStatus("blocked")}
              disabled={updating}
            />
            <ActionButton
              label="Omitido"
              icon="⏭️"
              active={item.state.status === "skipped"}
              onClick={() => onChangeStatus("skipped")}
              disabled={updating}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50",
        active
          ? "bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-500/20"
          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-500/50",
      ].join(" ")}
    >
      <span className="block text-lg mb-0.5">{icon}</span>
      <span className="block">{label}</span>
    </button>
  );
}
