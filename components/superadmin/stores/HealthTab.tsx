"use client";

/**
 * HealthTab — Auditoría de onboarding/configuración por tienda.
 *
 * Muestra qué le falta a cada negocio del marketplace: logo, banner, Yape,
 * dirección, RUC, etc. Score % por tienda + estados visuales rojo/amarillo/verde.
 *
 * Usado en /superadmin/stores como tab "Salud".
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
} from "@buleje/design-system/icons";
import { StatCard } from "./StatCard";
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

const STATUS_DOT: Record<CheckStatus, string> = {
  done: "bg-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]",
  missing: "bg-rose-500",
};

const STATUS_BG: Record<CheckStatus, string> = {
  done: "bg-emerald-50 dark:bg-emerald-950/40 text-[var(--data-success-700)] dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  warning: "bg-amber-50 dark:bg-amber-950/40 text-[var(--data-warning-700)] dark:text-amber-300 border-amber-200 dark:border-amber-900",
  missing: "bg-rose-50 dark:bg-rose-950/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border-rose-200 dark:border-rose-900",
};

function scoreColor(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 80) return { bar: "bg-[var(--data-success-500)]", text: "text-[var(--data-success-600)]", label: "Saludable" };
  if (pct >= 50) return { bar: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning-600)]", label: "Atención" };
  return { bar: "bg-rose-500", text: "text-[var(--data-error-500)]", label: "Crítica" };
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

export function HealthTab() {
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Tenants marcados como atendidos (revisados manualmente) — persistencia local
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

  // ── Modal de acción para editar/subir el dato faltante ──
  const [actionModal, setActionModal] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    checkId: string;
    checkLabel: string;
  } | null>(null);

  // ── Modal "Rellenar datos" — todos los campos en uno ──
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
        localStorage.setItem(
          "buleje:health:attended",
          JSON.stringify([...next]),
        );
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
          i.tenantName.toLowerCase().includes(q) ||
          i.tenantSlug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filterMode, search, hideAttended, attended]);

  return (
    <div className="space-y-4">
      {/* Stats hero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-[var(--data-success-600)]" />}
          label="Saludables (≥80%)"
          value={stats?.healthy ?? "—"}
          sub={stats ? `${Math.round(((stats.healthy) / (stats.total || 1)) * 100)}% del total` : undefined}
          trend="up"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-[var(--data-warning-600)]" />}
          label="En atención (50-79%)"
          value={stats?.warning ?? "—"}
          sub="Falta detalle"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-[var(--data-error-500)]" />}
          label="Críticas (<50%)"
          value={stats?.critical ?? "—"}
          sub="Acción urgente"
          trend={stats && stats.critical > 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={<RefreshCw className="h-5 w-5" />}
          label="Total tiendas"
          value={stats?.total ?? "—"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tienda por nombre o slug..."
            className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
          />
        </div>
        <div className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          {(
            [
              { k: "all", label: "Todas" },
              { k: "critical", label: "Críticas" },
              { k: "warning", label: "Atención" },
              { k: "healthy", label: "Saludables" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setFilterMode(opt.k)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filterMode === opt.k
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={hideAttended}
            onChange={(e) => setHideAttended(e.target.checked)}
            className="h-4 w-4"
          />
          Ocultar atendidos ({attended.size})
        </label>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          {error}
        </div>
      )}

      {!items && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Lista de tenants */}
      {/* Modal contextual de acción (un check a la vez) */}
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

      {/* Modal unificado "Rellenar datos" (todos los campos en uno) */}
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

      {items && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--rule-soft)] py-10 text-center text-sm text-[var(--text-tertiary)]">
              Sin tiendas que coincidan con el filtro.
            </div>
          )}
          {filtered.map((item) => {
            const sc = scoreColor(item.scorePct);
            const isExpanded = expanded.has(item.tenantId);
            const isAttended = attended.has(item.tenantId);
            const wa = whatsAppHref(item.ownerPhone, item.tenantName);
            return (
              <div
                key={item.tenantId}
                className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden ${
                  isAttended ? "opacity-60" : ""
                }`}
              >
                {/* Row colapsada — div+role en vez de button para permitir
                    botones anidados (WhatsApp / Atendido) sin hydration error. */}
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
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--surface-sunken)]/50 transition-colors cursor-pointer"
                >
                  {/* Score circular */}
                  <div className="shrink-0 relative">
                    <div className="h-12 w-12 rounded-full bg-[var(--surface-sunken)] grid place-items-center">
                      <span className={`text-sm font-black tabular-nums ${sc.text}`}>
                        {item.scorePct}%
                      </span>
                    </div>
                  </div>

                  {/* Identidad */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {item.tenantName}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                        {item.plan}
                      </span>
                      {!item.active && (
                        <span className="text-[length:var(--ts-2xs)] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-[var(--data-error-500)]">
                          Inactiva
                        </span>
                      )}
                      {item.store && !item.store.isPublished && (
                        <span className="text-[length:var(--ts-2xs)] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-[var(--data-warning-700)]">
                          No publicada
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">/{item.tenantSlug}</span>
                      <span>·</span>
                      <span>{item.productCount} productos</span>
                      {item.missingCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--data-error-500)] font-bold">
                            {item.missingCount} faltan
                          </span>
                        </>
                      )}
                      {item.warningCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--data-warning-600)] font-bold">
                            {item.warningCount} con detalle
                          </span>
                        </>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 w-full max-w-md rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                      <div
                        className={`h-full ${sc.bar} transition-all`}
                        style={{ width: `${item.scorePct}%` }}
                      />
                    </div>
                  </div>

                  {/* Acciones rápidas */}
                  <div className="shrink-0 flex items-center gap-1.5">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Rellenar datos
                    </button>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-[var(--data-success-700)] hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
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
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                        isAttended
                          ? "bg-emerald-100 text-[var(--data-success-700)] hover:bg-emerald-200"
                          : "border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isAttended ? "Atendido" : "Marcar"}
                    </button>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {item.checks.map((c) => (
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
                          className={`text-left rounded-lg border p-3 transition-all hover:scale-[1.01] hover:shadow-sm ${STATUS_BG[c.status]}`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-1 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[c.status]}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold">{c.label}</span>
                                {c.required === false && (
                                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
                                    opcional
                                  </span>
                                )}
                                {c.status !== "done" && (
                                  <span className="ml-auto text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider opacity-80">
                                    Click para arreglar →
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs opacity-80 leading-snug">{c.help}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`/superadmin/tenants/${item.tenantSlug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
                      >
                        Ver tenant
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {item.store && (
                        <a
                          href={`/tienda/${item.store.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
                        >
                          Ver tienda pública
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
