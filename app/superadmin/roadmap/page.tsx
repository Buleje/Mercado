"use client";

import { LoadingState } from "@buleje/design-system";
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


import { useCallback, useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/nextjs";
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
  PartyPopper,
  Flame,
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
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--data-warning)]",
    border: "border-[var(--data-warning)]/60",
    label: "Tier S · Crítico",
  },
  A: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-slate-900",
    border: "border-slate-400/60",
    label: "Tier A · Estratégico",
  },
  B: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--data-warning)]",
    border: "border-[var(--data-warning)]/60",
    label: "Tier B · Complementario",
  },
  C: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-gray-900",
    border: "border-gray-400/60",
    label: "Tier C · Backlog",
  },
};

const PRIORITY_COLORS: Record<RoadmapPriority, string> = {
  P0: "bg-[var(--data-error)]/20 text-[var(--data-error)] dark:text-[var(--data-error)] border-[var(--data-error)]/40",
  P1: "bg-[var(--data-warning)]/20 text-[var(--data-warning)] dark:text-[var(--data-warning)] border-[var(--data-warning)]/40",
  P2: "bg-[var(--data-warning)]/20 text-[var(--data-warning)] dark:text-[var(--data-warning)] border-[var(--data-warning)]/40",
  P3: "bg-[var(--data-success)]/20 text-[var(--data-success)] dark:text-[var(--data-success)] border-[var(--data-success)]/40",
};

const EFFORT_COLORS: Record<RoadmapEffort, string> = {
  S: "bg-[var(--data-success)]/20 text-[var(--data-success)] dark:text-[var(--data-success)] border-[var(--data-success)]/40",
  M: "bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/40",
  L: "bg-[var(--data-info)]/20 text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--data-info)]/40",
  XL: "bg-[var(--data-info)]/20 text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--data-info)]/40",
};

const TYPE_EMOJI: Record<RoadmapType, string> = {
  fix: "",
  new: "",
  expansion: "",
  complete: "",
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
  marketplace: "bg-fuchsia-500/10 text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-fuchsia-500/30",
  admin: "bg-[var(--data-info)]/10 text-[var(--data-info)] dark:text-[var(--data-info)] border-[var(--data-info)]/30",
  superadmin: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
  store: "bg-[var(--data-success)]/10 text-[var(--data-success)] dark:text-[var(--data-success)] border-[var(--data-success)]/30",
  "cross-cutting": "bg-[var(--data-info)]/10 text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--data-info)]/30",
  "product-ux": "bg-[var(--data-info)]/10 text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--data-info)]/30",
};

const STATUS_META: Record<
  StatusValue,
  { label: string; emoji: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  planned: {
    label: "Planificado",
    emoji: "📋",
    color: "bg-gray-500/10 text-[var(--text-secondary)] border-gray-500/30",
    icon: Circle,
  },
  in_progress: {
    label: "En progreso",
    emoji: "🔄",
    color: "bg-[var(--data-success)]/10 text-[var(--data-success)] dark:text-[var(--data-success)] border-[var(--data-success)]/40",
    icon: Loader2,
  },
  done: {
    label: "Hecho",
    emoji: "✅",
    color: "bg-[var(--data-success)]/10 text-[var(--data-success)] dark:text-[var(--data-success)] border-[var(--data-success)]/40",
    icon: CheckCircle2,
  },
  blocked: {
    label: "Bloqueado",
    emoji: "🚧",
    color: "bg-[var(--data-error)]/10 text-[var(--data-error)] dark:text-[var(--data-error)] border-[var(--data-error)]/40",
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
      Sentry.captureException(err);
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
      <LoadingState />
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-[var(--data-error)] mx-auto mb-3" />
        <h2 className="text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold mb-2">Error al cargar</h2>
        <p className="text-[var(--data-error)] dark:text-[var(--data-error)] text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-2 bg-[var(--data-error)] text-white rounded-lg text-sm font-medium hover:bg-[var(--data-error)]"
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
            <div className="w-11 h-11 rounded-xl bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-[var(--shadow-md)]">
              <MapIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                Roadmap
              </h1>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                84 mejoras consolidadas · Research 2026-04-09
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] text-sm text-[var(--text-secondary)] transition-colors disabled:opacity-50"
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
          accent="from-emerald-500 to-indigo-600"
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
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Progreso global
            </span>
          </div>
          <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
            {data.stats.done} / {data.stats.total}
            <span className="ml-2 font-bold text-[var(--accent)]">
              {progressPct}%
            </span>
          </span>
        </div>
        <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-[var(--dur-slower)] ease-out rounded-full"
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
          <div className="text-center py-16 bg-[var(--surface-raised)] border border-dashed border-[var(--rule-base)] rounded-xl">
            <Filter className="w-10 h-10 mx-auto mb-3 text-gray-400" />
            <p className="text-[var(--text-tertiary)] font-medium">
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
              className="mt-3 text-sm text-[var(--accent)] hover:underline"
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
                  : "bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900",
            ].join(" ")}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ─── Celebration overlay ─────────────────────────────────────────── */}
      {celebratingId && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="animate-ping absolute inline-flex h-48 w-48 rounded-full bg-[var(--data-success)]/40" />
          <div className="relative bg-[var(--surface-raised)] border border-[var(--data-success)] dark:border-[var(--data-success)] rounded-xl px-6 py-4 text-center">
            <PartyPopper className="h-8 w-8 text-[var(--data-success)] dark:text-[var(--data-success)] mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm font-extrabold tracking-tight text-[var(--data-success)] dark:text-[var(--data-success)]">
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
    <div className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 overflow-hidden shadow-sm">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-[var(--surface-sunken)] ${accent}`} />
      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide mb-2">
        {icon}
        {label}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-[var(--text-primary)] tabular-nums">
          {value}
        </div>
        {sub && (
          <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-1 tabular-nums">
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
    <div className="relative bg-[var(--surface-sunken)]/10 via-orange-500/5 to-red-500/10 dark:from-red-950/50 dark:via-red-900/30 dark:to-red-950/50 border-2 border-[var(--data-error)]/40 dark:border-[var(--data-error)] rounded-3xl p-6 overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--data-error)]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-[var(--data-error)] dark:text-[var(--data-error)] animate-pulse" />
            <h2 className="text-lg font-bold text-[var(--data-error)] dark:text-[var(--data-error)] uppercase tracking-wide">
              Bugs Críticos
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--data-error)] text-white font-bold">
              {doneCount}/{total}
            </span>
          </div>
          <p className="text-sm text-[var(--data-error)]/80 dark:text-[var(--data-error)]/80">
            Arreglos de máxima prioridad — están corrompiendo data o reportando
            números falsos hoy mismo.
          </p>
        </div>
        <div className="flex-shrink-0 w-32">
          <div className="text-right text-xs text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold mb-1 tabular-nums">
            {pct}%
          </div>
          <div className="h-2 bg-[var(--data-error)] dark:bg-red-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--surface-sunken)] transition-all duration-[var(--dur-slow)]"
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
                "bg-white/80 dark:bg-gray-900/80 backdrop-blur border rounded-xl p-4 shadow-sm transition-all",
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
                    <span className="text-xs font-bold text-[var(--text-tertiary)]">
                      #{bug.number}
                    </span>
                    <StatusPill status={bug.state.status} compact />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] line-clamp-2">
                    {bug.title}
                  </h3>
                </button>
              </div>

              <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 mb-3">
                {bug.impact}
              </p>

              {!isDone && (
                <div className="flex items-center gap-1.5">
                  {!isInProgress && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => onMarkInProgress(bug.id)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--data-success)] hover:bg-[var(--data-success)] text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Flame className="w-3 h-3" strokeWidth={2} />
                          Arreglar ahora
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onMarkDone(bug.id)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--data-success)] hover:bg-[var(--data-success)] text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Hecho
                  </button>
                </div>
              )}
              {isDone && (
                <div className="flex items-center gap-1.5 text-[var(--data-success)] dark:text-[var(--data-success)] text-xs font-bold">
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
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          Filtros
        </span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)] tabular-nums">
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
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
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
            { v: "planned", l: "Planificado" },
            { v: "in_progress", l: "En progreso" },
            { v: "done", l: "Hecho" },
            { v: "blocked", l: "Bloqueado" },
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
      <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide w-20 shrink-0">
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
                  : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-teal-500/50",
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
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {tokens.label}
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
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
        "group relative bg-[var(--surface-raised)] border rounded-xl p-4 shadow-sm hover:shadow-lg transition-all",
        isCelebrating
          ? "border-emerald-500 ring-4 ring-emerald-400/30 animate-pulse"
          : item.state.status === "done"
            ? "border-emerald-300/50 dark:border-emerald-800/50 opacity-80"
            : "border-[var(--rule-base)] hover:border-teal-500/40",
      ].join(" ")}
    >
      {/* Top bar: number + type + priority + effort + status */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
          #{item.number}
        </span>
        <span title={TYPE_LABEL[item.type]} className="text-sm" aria-label={TYPE_LABEL[item.type]}>
          {TYPE_EMOJI[item.type]}
        </span>
        <TierBadge tier={item.tier} />
        <ScopeBadge scope={item.scope} />
        <span
          className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md border font-bold tabular-nums ${PRIORITY_COLORS[item.priority]}`}
        >
          {item.priority}
        </span>
        <span
          className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md border font-bold ${EFFORT_COLORS[item.effort]}`}
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
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1.5 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
          {item.title}
        </h3>
      </button>

      {/* Description */}
      <p
        className={`text-xs text-[var(--text-secondary)] mb-2 whitespace-pre-line ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {item.description}
      </p>
      {needsExpand && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-[var(--accent)] hover:underline mb-2"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}

      {/* Impact */}
      <div className="mb-3 flex items-start gap-1.5 p-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/40 dark:border-teal-900/40">
        <Sparkles className="w-3 h-3 text-[var(--accent)] shrink-0 mt-0.5" />
        <p className="text-[length:var(--ts-xs)] text-teal-800 dark:text-teal-300 leading-snug">
          {item.impact}
        </p>
      </div>

      {/* Progress bar (only if in_progress) */}
      {item.state.status === "in_progress" && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-1 font-semibold">
            <span>Progreso</span>
            <span className="tabular-nums">{item.state.progress}%</span>
          </div>
          <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-[var(--dur-slow)]"
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
          className="text-[length:var(--ts-xs)] px-2.5 py-1.5 rounded-lg bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--text-secondary)] font-semibold transition-colors"
        >
          Detalle
        </button>
        {isUpdating && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-1" />
        )}
      </div>

      {/* Footer: research file */}
      <div className="mt-3 pt-2 border-t border-[var(--rule-base)] flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
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
        compact ? "px-1.5 py-0.5 text-[length:var(--ts-2xs)]" : "px-2 py-1 text-xs",
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
      className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md font-bold ${t.bg} ${t.text}`}
    >
      {tier}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: RoadmapScope }) {
  return (
    <span
      className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md border font-medium ${SCOPE_COLOR[scope]}`}
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
        "text-[length:var(--ts-xs)] px-2 py-1.5 rounded-lg border font-semibold cursor-pointer transition-colors disabled:opacity-50",
        STATUS_META[value].color,
      ].join(" ")}
      aria-label="Cambiar estado"
    >
      <option value="planned">Planificado</option>
      <option value="in_progress">En progreso</option>
      <option value="done">Hecho</option>
      <option value="blocked">Bloqueado</option>
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
        className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-3xl max-w-3xl w-full shadow-[var(--shadow-xl)] my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--rule-base)] sticky top-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md z-10 rounded-t-3xl">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
                #{item.number}
              </span>
              <span className="text-lg" aria-label={TYPE_LABEL[item.type]}>
                {TYPE_EMOJI[item.type]}
              </span>
              <TierBadge tier={item.tier} />
              <ScopeBadge scope={item.scope} />
              <span
                className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md border font-bold ${PRIORITY_COLORS[item.priority]}`}
              >
                {item.priority}
              </span>
              <span
                className={`text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md border font-bold ${EFFORT_COLORS[item.effort]}`}
              >
                Esfuerzo {item.effort}
              </span>
              {item.isCriticalBug && (
                <span className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-md bg-[var(--data-error)] text-white font-bold animate-pulse">
                  🔴 BUG CRÍTICO
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-[var(--surface-sunken)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">
            {item.title}
          </h2>
          <StatusPill status={item.state.status} />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Description */}
          <section>
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Descripción
            </h3>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
              {item.description}
            </p>
          </section>

          {/* Impact */}
          <section className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
              <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Depende de
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {item.dependencies.map((dep) => (
                  <span
                    key={dep}
                    className="text-[length:var(--ts-xs)] px-2 py-1 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-mono"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Research source */}
          <section>
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Archivo de research
            </h3>
            <code className="text-xs px-2 py-1 rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-mono">
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
              <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Historial de notas
              </h3>
              <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-3 max-h-48 overflow-auto font-mono">
                {item.state.notes}
              </pre>
            </section>
          )}

          {/* Add note */}
          <section>
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
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
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/50"
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
        <div className="p-6 border-t border-[var(--rule-base)] sticky bottom-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md rounded-b-3xl">
          <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            Cambiar estado
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <ActionButton
              label="Planificado"
              Icon={Circle}
              active={item.state.status === "planned"}
              onClick={() => onChangeStatus("planned")}
              disabled={updating}
            />
            <ActionButton
              label="En progreso"
              Icon={Loader2}
              active={item.state.status === "in_progress"}
              onClick={() => onChangeStatus("in_progress")}
              disabled={updating}
            />
            <ActionButton
              label="Hecho"
              Icon={CheckCircle2}
              active={item.state.status === "done"}
              onClick={() => onChangeStatus("done")}
              disabled={updating}
            />
            <ActionButton
              label="Bloqueado"
              Icon={PauseCircle}
              active={item.state.status === "blocked"}
              onClick={() => onChangeStatus("blocked")}
              disabled={updating}
            />
            <ActionButton
              label="Omitido"
              Icon={SquareDashed}
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
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-3">
      <div className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  Icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
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
        "px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 flex flex-col items-center gap-1",
        active
          ? "bg-gray-900 border-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white"
          : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-gray-900 dark:hover:border-gray-400",
      ].join(" ")}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span className="block">{label}</span>
    </button>
  );
}
