"use client";

/**
 * HealthTab — Auditoría de onboarding/configuración por tienda.
 *
 * Rediseño 2026-05-11 — visual y accionable:
 *  - Hero con score promedio + distribución
 *  - Radial progress ring por tienda (en vez de texto plano)
 *  - Filter chips canónicos con counts por estado
 *  - Row preview: dots de cada check siempre visibles (sin expandir)
 *  - Bulk actions: WhatsApp masivo a tiendas críticas, mark all attended
 *  - Empty/loading states ilustrados
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Search,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  Sparkles,
  HeartPulse,
  Activity,
  Store as StoreIcon,
  type LucideIcon,
} from "@buleje/design-system/icons";
import HealthCheckActionModal from "./HealthCheckActionModal";
import HealthFillAllModal from "./HealthFillAllModal";

type CheckStatus = "done" | "missing" | "warning";

interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  help: string;
  required?: boolean;
}

interface HealthItem {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  plan: string;
  active: boolean;
  ownerPhone: string | null;
  ownerEmail: string | null;
  createdAt: string;
  store: {
    id: string;
    slug: string;
    name: string;
    isPublished: boolean;
    rating: number;
    reviewCount: number;
    category: string;
  } | null;
  checks: HealthCheck[];
  scorePct: number;
  missingCount: number;
  warningCount: number;
  productCount: number;
}

interface HealthStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
}

const CHECK_STATUS_META: Record<
  CheckStatus,
  { label: string; cls: string; dot: string; ring: string }
> = {
  done: {
    label: "Completo",
    cls: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
    ring: "ring-[var(--data-success-500)]/40",
  },
  warning: {
    label: "Con detalle",
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
    ring: "ring-amber-500/40",
  },
  missing: {
    label: "Falta",
    cls: "border-rose-300/60 bg-rose-50/60 text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]",
    dot: "bg-rose-500",
    ring: "ring-rose-500/40",
  },
};

function scoreColor(pct: number): {
  stroke: string;
  text: string;
  label: string;
  band: string;
  tone: "success" | "warning" | "danger";
} {
  if (pct >= 80)
    return {
      stroke: "var(--data-success-500)",
      text: "text-[var(--data-success-500)]",
      label: "Saludable",
      band: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5",
      tone: "success",
    };
  if (pct >= 50)
    return {
      stroke: "rgb(245 158 11)",
      text: "text-amber-600 dark:text-amber-400",
      label: "Atención",
      band: "border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20",
      tone: "warning",
    };
  return {
    stroke: "rgb(244 63 94)",
    text: "text-[var(--accent)] dark:text-[var(--accent)]",
    label: "Crítica",
    band: "border-rose-300/60 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/20",
    tone: "danger",
  };
}

function whatsAppHref(phone: string | null, tenantName: string) {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, "");
  if (clean.length < 8) return null;
  const num = clean.startsWith("51") ? clean : `51${clean}`;
  const text = encodeURIComponent(
    `Hola, te escribo desde Buleje sobre tu tienda *${tenantName}*. Necesitamos completar algunos datos del onboarding.`,
  );
  return `https://wa.me/${num}?text=${text}`;
}

// ─── Component ────────────────────────────────────────────────────────

export function HealthTab() {
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [attended, setAttended] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("buleje:health:attended");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [hideAttended, setHideAttended] = useState(false);

  const [actionModal, setActionModal] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    checkId: string;
    checkLabel: string;
  } | null>(null);

  const [fillAllModal, setFillAllModal] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
  } | null>(null);

  const markAttended = useCallback((tenantId: string) => {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      try {
        localStorage.setItem("buleje:health:attended", JSON.stringify([...next]));
      } catch {
        /* silent */
      }
      return next;
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setItems(null);
    setError("");
    try {
      const res = await fetch("/api/superadmin/stores/health", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error cargando health");
      const json = (await res.json()) as { items: HealthItem[]; stats: HealthStats };
      setItems(json.items);
      setStats(json.stats);
    } catch {
      setError("No pudimos cargar el estado de las tiendas.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = useCallback((tenantId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (filterMode === "critical") list = list.filter((i) => i.scorePct < 50);
    else if (filterMode === "warning")
      list = list.filter((i) => i.scorePct >= 50 && i.scorePct < 80);
    else if (filterMode === "healthy") list = list.filter((i) => i.scorePct >= 80);
    if (hideAttended) list = list.filter((i) => !attended.has(i.tenantId));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.tenantName.toLowerCase().includes(q) || i.tenantSlug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filterMode, search, hideAttended, attended]);

  const avgScore = useMemo(() => {
    if (!items || items.length === 0) return 0;
    return Math.round(items.reduce((s, i) => s + i.scorePct, 0) / items.length);
  }, [items]);

  const avgMeta = scoreColor(avgScore);

  return (
    <div className="space-y-5">
      {/* ── Hero with avg health score ───────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 p-5">
          {/* Big radial */}
          <div className="flex items-center gap-4 md:border-r md:border-[var(--rule-soft)] md:pr-5">
            <HealthRing pct={avgScore} size={88} stroke={6} color={avgMeta.stroke} />
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                Marketplace · Onboarding
              </p>
              <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Salud de las tiendas
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Score promedio:{" "}
                <strong className={avgMeta.text}>{avgScore}% · {avgMeta.label}</strong>
              </p>
            </div>
          </div>

          {/* Distribution bar */}
          <div className="flex flex-col justify-center gap-2 md:px-2">
            <div className="flex items-center justify-between text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              <span>Distribución</span>
              <span>{stats?.total ?? 0} tiendas</span>
            </div>
            {stats && stats.total > 0 ? (
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="flex h-full">
                  <div
                    className="bg-[var(--data-success-500)] transition-all"
                    style={{ width: `${(stats.healthy / stats.total) * 100}%` }}
                    title={`${stats.healthy} saludables`}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${(stats.warning / stats.total) * 100}%` }}
                    title={`${stats.warning} en atención`}
                  />
                  <div
                    className="bg-rose-500 transition-all"
                    style={{ width: `${(stats.critical / stats.total) * 100}%` }}
                    title={`${stats.critical} críticas`}
                  />
                </div>
              </div>
            ) : (
              <div className="h-2.5 w-full rounded-full bg-[var(--surface-sunken)]" />
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <LegendItem dot="bg-[var(--data-success-500)]" label="Saludables" value={stats?.healthy ?? 0} />
              <LegendItem dot="bg-amber-500" label="Atención" value={stats?.warning ?? 0} />
              <LegendItem dot="bg-rose-500" label="Críticas" value={stats?.critical ?? 0} />
            </div>
          </div>

          {/* Refresh button */}
          <div className="flex items-start md:items-center justify-end shrink-0">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={2.25}
              />
              Refrescar
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats KPI cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label="Saludables (≥80%)"
          value={stats?.healthy ?? "—"}
          sub={
            stats
              ? `${Math.round((stats.healthy / (stats.total || 1)) * 100)}% del total`
              : undefined
          }
          tone="success"
          onClick={() => setFilterMode("healthy")}
          active={filterMode === "healthy"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="En atención (50-79%)"
          value={stats?.warning ?? "—"}
          sub="Falta detalle"
          tone="warning"
          onClick={() => setFilterMode("warning")}
          active={filterMode === "warning"}
        />
        <KpiCard
          icon={XCircle}
          label="Críticas (<50%)"
          value={stats?.critical ?? "—"}
          sub="Acción urgente"
          tone="danger"
          onClick={() => setFilterMode("critical")}
          active={filterMode === "critical"}
        />
        <KpiCard
          icon={StoreIcon}
          label="Total tiendas"
          value={stats?.total ?? "—"}
          sub={attended.size > 0 ? `${attended.size} atendidas` : undefined}
          tone="accent"
          onClick={() => setFilterMode("all")}
          active={filterMode === "all"}
        />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o slug…"
            className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {(
            [
              { k: "all", label: "Todas", count: stats?.total ?? 0 },
              { k: "critical", label: "Críticas", count: stats?.critical ?? 0 },
              { k: "warning", label: "Atención", count: stats?.warning ?? 0 },
              { k: "healthy", label: "Saludables", count: stats?.healthy ?? 0 },
            ] as const
          ).map((opt) => {
            const isActive = filterMode === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={() => setFilterMode(opt.k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {opt.label}
                {opt.count > 0 && (
                  <span
                    className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {opt.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent)]/40">
          <input
            type="checkbox"
            checked={hideAttended}
            onChange={(e) => setHideAttended(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Ocultar atendidos
          {attended.size > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)]/10 px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-[var(--accent)]">
              {attended.size}
            </span>
          )}
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────── */}
      {actionModal && (
        <HealthCheckActionModal
          open={!!actionModal}
          onClose={() => setActionModal(null)}
          tenantId={actionModal.tenantId}
          tenantSlug={actionModal.tenantSlug}
          tenantName={actionModal.tenantName}
          checkId={actionModal.checkId}
          checkLabel={actionModal.checkLabel}
          onSaved={() => load(true)}
        />
      )}

      {fillAllModal && (
        <HealthFillAllModal
          open={!!fillAllModal}
          onClose={() => setFillAllModal(null)}
          tenantId={fillAllModal.tenantId}
          tenantSlug={fillAllModal.tenantSlug}
          tenantName={fillAllModal.tenantName}
          onSaved={() => load(true)}
        />
      )}

      {/* ── Loading ──────────────────────────────────────────── */}
      {!items && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty filter ─────────────────────────────────────── */}
      {items && filtered.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-12 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
            <HeartPulse
              className="h-6 w-6 text-[var(--text-tertiary)]"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
            Sin tiendas que coincidan
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Probá con otro filtro o limpiá la búsqueda.
          </p>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────── */}
      {items && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const sc = scoreColor(item.scorePct);
            const isExpanded = expanded.has(item.tenantId);
            const isAttended = attended.has(item.tenantId);
            const wa = whatsAppHref(item.ownerPhone, item.tenantName);

            return (
              <article
                key={item.tenantId}
                className={`rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition ${
                  isAttended
                    ? "border-[var(--data-success-500)]/30 opacity-70"
                    : isExpanded
                      ? "border-[var(--accent)]/40 shadow-md"
                      : "border-[var(--rule-soft)] hover:border-[var(--accent)]/30"
                }`}
              >
                {/* ─── Summary row ─── */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(item.tenantId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(item.tenantId);
                    }
                  }}
                  className="w-full text-left transition hover:bg-[var(--surface-sunken)]/30 cursor-pointer"
                >
                  {/* Brandon 2026-05-21 fix mobile: layout stack en <md.
                      Antes [donut | identidad | acciones] horizontal en
                      390px squeezeaba el centro hasta 80px → "T12 / pro
                      / ductos" verticales y "Buls..." cortado. Ahora:
                      · mobile: donut+identidad arriba en row / acciones
                        abajo full-width
                      · desktop: row horizontal intacto */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4">
                    {/* Top sub-row mobile: donut + identidad */}
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* Radial ring */}
                    <div className="shrink-0">
                      <HealthRing
                        pct={item.scorePct}
                        size={56}
                        stroke={5}
                        color={sc.stroke}
                      />
                    </div>

                    {/* Identity + dots */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-base font-extrabold text-[var(--text-primary)] tracking-tight truncate">
                          {item.tenantName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${sc.band} ${sc.text}`}
                        >
                          <span
                            className={`h-1 w-1 rounded-full`}
                            style={{ background: sc.stroke }}
                          />
                          {sc.label}
                        </span>
                        <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                          {item.plan}
                        </span>
                        {!item.active && (
                          <span className="rounded-full border border-rose-300/60 bg-rose-50/60 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]">
                            Inactiva
                          </span>
                        )}
                        {item.store && !item.store.isPublished && (
                          <span className="rounded-full border border-amber-300/60 bg-amber-50/60 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
                            No publicada
                          </span>
                        )}
                        {isAttended && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-success-500)]">
                            <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={3} />
                            Atendido
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-[var(--text-tertiary)]">
                        <span className="font-mono">/{item.tenantSlug}</span>
                        <span>·</span>
                        <span>{item.productCount} productos</span>
                        {item.missingCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-bold text-[var(--accent)] dark:text-[var(--accent)]">
                              {item.missingCount} faltan
                            </span>
                          </>
                        )}
                        {item.warningCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {item.warningCount} con detalle
                            </span>
                          </>
                        )}
                      </div>
                      {/* Check dots preview (always visible) */}
                      <div className="mt-2 flex items-center gap-1">
                        {item.checks.map((c) => (
                          <span
                            key={c.id}
                            title={`${c.label}: ${CHECK_STATUS_META[c.status].label}`}
                            className={`h-1.5 w-3 rounded-sm ${CHECK_STATUS_META[c.status].dot}`}
                          />
                        ))}
                        <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                          {item.checks.filter((c) => c.status === "done").length}/
                          {item.checks.length}
                        </span>
                      </div>
                    </div>
                    </div>

                    {/* Quick actions — Brandon 2026-05-21 fix mobile:
                        full-width abajo en stack, inline desktop.
                        · Rellenar: flex-1 mobile (CTA primario expandido)
                        · WA: flex-1 cuando existe
                        · Atendido + chevron: shrink-0 íconos cuadrados */}
                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFillAllModal({
                            tenantId: item.tenantId,
                            tenantSlug: item.tenantSlug,
                            tenantName: item.tenantName,
                          });
                        }}
                        className="flex-1 sm:flex-none inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/20 transition hover:brightness-110"
                        title="Rellenar todos los datos faltantes"
                      >
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Rellenar
                      </button>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 sm:flex-none inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3 text-xs font-extrabold uppercase tracking-wider text-[var(--data-success-500)] transition hover:bg-[var(--data-success-500)]/10"
                          title="WhatsApp al dueño"
                        >
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                          WA
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAttended(item.tenantId);
                        }}
                        aria-pressed={isAttended}
                        title={isAttended ? "Marcar como pendiente" : "Marcar como atendido"}
                        className={`shrink-0 inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl transition ${
                          isAttended
                            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                            : "border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                      <ChevronDown
                        className={`shrink-0 h-5 w-5 text-[var(--text-tertiary)] transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        strokeWidth={2}
                      />
                    </div>
                  </div>
                </div>

                {/* ─── Expanded detail ─── */}
                {isExpanded && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 p-4 space-y-3">
                    {/* Checks grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.checks.map((c) => {
                        const meta = CHECK_STATUS_META[c.status];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setActionModal({
                                tenantId: item.tenantId,
                                tenantSlug: item.tenantSlug,
                                tenantName: item.tenantName,
                                checkId: c.id,
                                checkLabel: c.label,
                              })
                            }
                            className={`text-left rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${meta.cls}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span
                                className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-transparent ${meta.ring}`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${meta.dot}`}
                                  aria-hidden
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold">{c.label}</span>
                                  {c.required === false && (
                                    <span className="rounded-full bg-black/5 px-1.5 py-0 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider dark:bg-white/10">
                                      Opcional
                                    </span>
                                  )}
                                  <span className="ml-auto text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider opacity-80">
                                    {meta.label}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs opacity-90 leading-snug">{c.help}</p>
                                {c.status !== "done" && (
                                  <p className="mt-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider opacity-80">
                                    Click para arreglar →
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Outbound links */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--rule-soft)]">
                      <a
                        href={`/superadmin/tenants/${item.tenantSlug}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                      >
                        <Activity className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Ver tenant
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                      {item.store && (
                        <a
                          href={`/tienda/${item.store.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        >
                          <StoreIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
                          Ver tienda pública
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function HealthRing({
  pct,
  size,
  stroke,
  color,
}: {
  pct: number;
  size: number;
  stroke: number;
  color: string;
}) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--surface-sunken)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          fill="none"
          className="transition-all duration-[var(--dur-slow)] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-display font-extrabold tabular-nums"
          style={{
            color,
            fontSize: size > 64 ? "1.125rem" : "0.875rem",
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

function LegendItem({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-bold text-[var(--text-primary)] tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone: "success" | "warning" | "danger" | "accent";
  onClick?: () => void;
  active?: boolean;
}) {
  const iconBg = {
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]",
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border bg-[var(--surface-raised)] p-4 transition ${
        active
          ? "border-[var(--accent)]/40 shadow-md shadow-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20"
          : "border-[var(--rule-soft)] hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--accent)]/30"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </button>
  );
}
