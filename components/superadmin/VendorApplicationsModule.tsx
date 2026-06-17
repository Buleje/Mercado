"use client";

/**
 * VendorApplicationsModule — Review de aplicaciones de vendedores (ADR-079).
 *
 * Features:
 *  - Vista responsive: tabla en desktop / cards en mobile (no overflow horizontal)
 *  - SLA badge por aplicación (verde<24h, ámbar<72h, rojo>72h)
 *  - Bulk actions: aprobar/rechazar N seleccionadas
 *  - Filtros expandidos: status + categoría + distrito + búsqueda
 *  - Sort por columnas (fecha / negocio)
 *  - Deep-link ?id=xxx abre drawer al cargar
 *  - Auto-refresh opt-in cada 60s
 *  - Keyboard: `/` foco busqueda, `r` recarga, `Esc` cierra drawer/limpia
 *  - Toast inline para feedback de acciones
 *  - CSV export RFC 4180 (escape correcto)
 *  - Skeleton loading
 *  - Touch targets ≥44px en mobile, focus rings visibles
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  Search,
  Download,
  Eye,
  Check,
  X,
  MessageSquare,
  Loader2,
  Copy,
  RefreshCcw,
  ArrowUpDown,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  ApplicationDetailsDrawer,
  type VendorApplication,
} from "./vendor-applications/ApplicationDetailsDrawer";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** RFC 4180 cell escape: wrap in quotes if cell contains comma/quote/newline. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: VendorApplication[]) {
  const headers = [
    "ID",
    "Razon social",
    "RUC",
    "Propietario",
    "Telefono",
    "Email",
    "Distrito",
    "Categoria",
    "Estado",
    "Enviada",
    "Revisada",
  ];
  const csvRows = rows.map((r) => [
    r.id,
    r.businessName,
    r.ruc,
    r.ownerName,
    r.phone,
    r.email,
    r.district,
    r.category,
    r.status,
    r.submittedAt,
    r.reviewedAt ?? "",
  ]);
  // BOM para que Excel detecte UTF-8
  const csv =
    "﻿" +
    [headers, ...csvRows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendor_applications_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** SLA por antigüedad — tono semántico para que el revisor priorice. */
function slaInfo(submittedAt: string): {
  label: string;
  tone: "good" | "warn" | "bad";
  hours: number;
} {
  const ms = Date.now() - new Date(submittedAt).getTime();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  let label: string;
  if (hours < 1) label = "recién";
  else if (hours < 24) label = `${hours}h`;
  else if (days < 30) label = `${days}d`;
  else label = `${Math.floor(days / 30)}m`;
  const tone: "good" | "warn" | "bad" =
    hours >= 72 ? "bad" : hours >= 24 ? "warn" : "good";
  return { label, tone, hours };
}

/** Color de avatar determinista a partir del businessName. */
function avatarColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 60% 45%)`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<VendorApplication["status"], string> = {
  pendiente:
    "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  aprobada:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  rechazada:
    "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  info_solicitada:
    "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
};

const STATUS_LABELS: Record<VendorApplication["status"], string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  info_solicitada: "Info solicitada",
};

const SLA_STYLES: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  warn: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
  bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: "warning" | "success" | "danger" | "info" | "accent";
  subtitle?: string;
}) {
  const iconBg = {
    warning:
      "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
    success:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    danger:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    info: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-3 sm:mt-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-soft)]">
      <div className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-1/2 rounded bg-[var(--surface-sunken)] animate-pulse" />
        <div className="h-3 w-1/3 rounded bg-[var(--surface-sunken)] animate-pulse" />
      </div>
      <div className="h-6 w-20 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      style={{ background: avatarColor(name) }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-extrabold text-white shrink-0"
    >
      {initials(name)}
    </span>
  );
}

// ── SLA badge ───────────────────────────────────────────────────────────────

function SlaBadge({ submittedAt }: { submittedAt: string }) {
  const sla = slaInfo(submittedAt);
  return (
    <span
      title={`Enviada hace ${sla.hours}h`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
        SLA_STYLES[sla.tone],
      )}
    >
      <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      {sla.label}
    </span>
  );
}

// ── Data layer ──────────────────────────────────────────────────────────────

type Stats = {
  pending: number;
  underReview: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  tenantProvisioned: number;
  avgReviewDays: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
};

type ToastTone = "success" | "error" | "info";
type ToastMsg = { id: number; text: string; tone: ToastTone };

async function fetchApplications(status: string): Promise<VendorApplication[]> {
  const res = await fetch(
    `/api/superadmin/vendor-applications?status=${encodeURIComponent(status)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    ok: boolean;
    applications: VendorApplication[];
  };
  return json.applications;
}

async function fetchStats(): Promise<Stats | null> {
  try {
    const res = await fetch("/api/superadmin/vendor-applications/stats", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; stats: Stats };
    return json.stats;
  } catch {
    return null;
  }
}

async function postReview(
  id: string,
  action:
    | "start_review"
    | "request_info"
    | "approve"
    | "reject"
    | "reopen",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/superadmin/vendor-applications/${id}/review`, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

// ── Sort & filter helpers ───────────────────────────────────────────────────

type SortKey = "submittedAt" | "businessName" | "district";
type SortDir = "asc" | "desc";

function sortApps(
  apps: VendorApplication[],
  key: SortKey,
  dir: SortDir,
): VendorApplication[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...apps].sort((a, b) => {
    const av = (a[key] ?? "") as string;
    const bv = (b[key] ?? "") as string;
    if (key === "submittedAt") {
      return (
        (new Date(av).getTime() - new Date(bv).getTime()) * mult
      );
    }
    return av.localeCompare(bv, "es") * mult;
  });
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function VendorApplicationsModule() {
  const [apps, setApps] = useState<VendorApplication[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    VendorApplication["status"] | "all"
  >("pendiente");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");

  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selected, setSelected] = useState<VendorApplication | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastIdRef = useRef(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // ── Debounce search 200ms ────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Map UI filter to backend status ──────────────────────────────────
  const backendStatus = useMemo(() => {
    switch (statusFilter) {
      case "pendiente":
        return "pending";
      case "aprobada":
        return "approved";
      case "rechazada":
        return "rejected";
      case "info_solicitada":
        return "info_requested";
      default:
        return "all";
    }
  }, [statusFilter]);

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const [list, s] = await Promise.all([
          fetchApplications(backendStatus),
          fetchStats(),
        ]);
        setApps(list);
        setStats(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [backendStatus],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Deep-link ?id= opens drawer ──────────────────────────────────────
  useEffect(() => {
    if (apps.length === 0) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (id) {
      const found = apps.find((a) => a.id === id);
      if (found && !selected) setSelected(found);
    }
    // we want this only when apps loads — selected dep would cause loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  const openDetails = (a: VendorApplication) => {
    setSelected(a);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", a.id);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const closeDetails = () => {
    setSelected(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      window.history.replaceState({}, "", url.toString());
    }
  };

  // ── Auto refresh ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => reload(true), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, reload]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "Escape") {
        if (selected) {
          closeDetails();
        } else if (searchRaw) {
          setSearchRaw("");
        }
        return;
      }
      if (inField) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
     
  }, [reload, selected, searchRaw]);

  // ── Derive filter options from data ──────────────────────────────────
  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    apps.forEach((a) => s.add(a.category));
    return Array.from(s).sort();
  }, [apps]);

  const districtOptions = useMemo(() => {
    const s = new Set<string>();
    apps.forEach((a) => s.add(a.district));
    return Array.from(s).sort();
  }, [apps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = apps.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter)
        return false;
      if (districtFilter !== "all" && a.district !== districtFilter)
        return false;
      if (!q) return true;
      return (
        a.businessName.toLowerCase().includes(q) ||
        a.ruc.includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.district.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
    return sortApps(result, sortKey, sortDir);
  }, [apps, search, categoryFilter, districtFilter, sortKey, sortDir]);

  // ── Selection ────────────────────────────────────────────────────────
  const visibleIds = useMemo(() => filtered.map((a) => a.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Single actions ───────────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    const res = await postReview(id, "approve");
    if (!res.ok) {
      setError(res.error ?? "No se pudo aprobar");
      pushToast(res.error ?? "Error al aprobar", "error");
      return;
    }
    pushToast("Aprobada", "success");
    closeDetails();
    await reload(true);
  };

  const handleReject = async (id: string, reason: string) => {
    const res = await postReview(id, "reject", reason);
    if (!res.ok) {
      setError(res.error ?? "No se pudo rechazar");
      pushToast(res.error ?? "Error al rechazar", "error");
      return;
    }
    pushToast("Rechazada", "success");
    closeDetails();
    await reload(true);
  };

  const handleRequestInfo = async (id: string, info: string) => {
    const current = apps.find((a) => a.id === id);
    if (current?.status === "pendiente") {
      await postReview(id, "start_review");
    }
    const res = await postReview(id, "request_info", info);
    if (!res.ok) {
      setError(res.error ?? "No se pudo solicitar info");
      pushToast(res.error ?? "Error al solicitar info", "error");
      return;
    }
    pushToast("Info solicitada", "success");
    closeDetails();
    await reload(true);
  };

  const handleReopen = async (id: string) => {
    const res = await postReview(id, "reopen");
    if (!res.ok) {
      setError(res.error ?? "No se pudo reabrir");
      pushToast(res.error ?? "Error al reabrir", "error");
      return;
    }
    pushToast("Aplicación reabierta", "success");
    closeDetails();
    await reload(true);
  };

  // ── Bulk actions ─────────────────────────────────────────────────────
  const bulkApprove = async () => {
    const ids = Array.from(selectedIds).filter(
      (id) => apps.find((a) => a.id === id)?.status === "pendiente",
    );
    if (ids.length === 0) {
      pushToast("Solo las pendientes se pueden aprobar en lote", "info");
      return;
    }
    if (!window.confirm(`¿Aprobar ${ids.length} aplicaciones pendientes?`))
      return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const res = await postReview(id, "approve");
      if (res.ok) ok++;
      else fail++;
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    pushToast(
      `Aprobadas ${ok}${fail > 0 ? ` · ${fail} fallaron` : ""}`,
      fail > 0 ? "error" : "success",
    );
    await reload(true);
  };

  const bulkReject = async () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const s = apps.find((a) => a.id === id)?.status;
      return s === "pendiente" || s === "info_solicitada";
    });
    if (ids.length === 0) {
      pushToast("Ninguna seleccionada es rechazable", "info");
      return;
    }
    const reason = window.prompt(
      `Motivo del rechazo (aplica a ${ids.length}):`,
      "",
    );
    if (!reason || !reason.trim()) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const res = await postReview(id, "reject", reason.trim());
      if (res.ok) ok++;
      else fail++;
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    pushToast(
      `Rechazadas ${ok}${fail > 0 ? ` · ${fail} fallaron` : ""}`,
      fail > 0 ? "error" : "success",
    );
    await reload(true);
  };

  // ── KPIs ─────────────────────────────────────────────────────────────
  const pendientes =
    stats?.pending ?? apps.filter((a) => a.status === "pendiente").length;
  const aprobadasEsteMes = stats?.approvedThisMonth ?? 0;
  const rechazadasEsteMes = stats?.rejectedThisMonth ?? 0;
  const avgReviewDays = stats?.avgReviewDays ?? 0;

  // ── Sort header ──────────────────────────────────────────────────────
  const SortBtn = ({
    field,
    children,
  }: {
    field: SortKey;
    children: React.ReactNode;
  }) => {
    const active = sortKey === field;
    return (
      <button
        onClick={() => {
          if (active) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
          } else {
            setSortKey(field);
            setSortDir("desc");
          }
        }}
        className={cn(
          "inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors",
          active && "text-[var(--text-primary)]",
        )}
      >
        {children}
        <ArrowUpDown
          className={cn(
            "h-3 w-3 opacity-60",
            active && "opacity-100 text-[var(--accent)]",
          )}
        />
      </button>
    );
  };

  // ── Copy clipboard ───────────────────────────────────────────────────
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${what} copiado`, "success");
    } catch {
      pushToast("No se pudo copiar", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Toasts ────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
              t.tone === "success" &&
                "bg-emerald-600 text-white",
              t.tone === "error" && "bg-rose-600 text-white",
              t.tone === "info" && "bg-slate-800 text-white",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="w-full">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Building2
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Marketplace · Onboarding
                </p>
                <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Aplicaciones de vendedores
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Aprobá, rechazá o solicitá info. Atajos:{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    /
                  </kbd>{" "}
                  buscar ·{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    R
                  </kbd>{" "}
                  recargar ·{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    Esc
                  </kbd>{" "}
                  cerrar
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2 flex-wrap shrink-0">
              <button
                onClick={() => reload()}
                disabled={refreshing}
                title="Recargar (R)"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
              >
                <RefreshCcw
                  className={cn(
                    "h-4 w-4",
                    refreshing && "animate-spin",
                  )}
                  aria-hidden
                />
                <span className="hidden sm:inline">Recargar</span>
              </button>
              <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="hidden sm:inline">Auto 60s</span>
                <span className="sm:hidden">Auto</span>
              </label>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-bold underline shrink-0 min-h-[32px] px-2"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Pendientes"
            value={pendientes}
            icon={Clock}
            tone="warning"
            subtitle="Requieren revisión"
          />
          <StatCard
            label="Aprobadas este mes"
            value={aprobadasEsteMes}
            icon={CheckCircle}
            tone="success"
            subtitle="Nuevos vendedores"
          />
          <StatCard
            label="Rechazadas este mes"
            value={rechazadasEsteMes}
            icon={XCircle}
            tone="danger"
            subtitle="No aprobadas"
          />
          <StatCard
            label="Tiempo de review"
            value={`${avgReviewDays}d`}
            icon={Timer}
            tone="info"
            subtitle="Promedio histórico"
          />
        </div>

        {/* Toolbar */}
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                type="search"
                inputMode="search"
                placeholder="Buscar negocio, RUC, propietario, email, distrito…"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                aria-label="Buscar aplicaciones"
                className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-9 pr-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>
            <button
              onClick={() => exportCSV(filtered)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              title="Exportar CSV"
            >
              <Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              CSV ({filtered.length})
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as VendorApplication["status"] | "all",
                )
              }
              aria-label="Filtrar por estado"
              className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
              <option value="info_solicitada">Info solicitada</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoría"
              className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="all">Todas categorías</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              aria-label="Filtrar por distrito"
              className="col-span-2 sm:col-span-1 h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="all">Todos los distritos</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/5 backdrop-blur px-4 py-3 shadow-sm">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="h-10 px-3 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                Limpiar
              </button>
              <button
                onClick={bulkReject}
                disabled={bulkBusy}
                className="h-10 px-3.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 dark:text-rose-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
              <button
                onClick={bulkApprove}
                disabled={bulkBusy}
                className="h-10 px-3.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {bulkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Aprobar
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
              <Building2
                className="h-6 w-6 text-[var(--text-tertiary)]"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
            <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
              Sin aplicaciones que mostrar
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Ajustá los filtros para ver más.
            </p>
            {(search ||
              categoryFilter !== "all" ||
              districtFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchRaw("");
                  setCategoryFilter("all");
                  setDistrictFilter("all");
                }}
                className="mt-4 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Mobile: cards ───────────────────────────────── */}
            <ul className="md:hidden space-y-2.5">
              {filtered.map((a) => {
                const sla = slaInfo(a.submittedAt);
                const isSel = selectedIds.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-2xl border-2 bg-[var(--surface-raised)] p-3.5 transition",
                      isSel
                        ? "border-[var(--accent)]"
                        : "border-[var(--rule-soft)]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <label className="inline-flex h-11 w-11 items-center justify-center -ml-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelectOne(a.id)}
                          aria-label={`Seleccionar ${a.businessName}`}
                          className="h-5 w-5 accent-[var(--accent)] cursor-pointer"
                        />
                      </label>
                      <Avatar name={a.businessName} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-base text-[var(--text-primary)] truncate">
                          {a.businessName}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] truncate">
                          {a.ownerName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0",
                          STATUS_STYLES[a.status],
                        )}
                      >
                        {STATUS_LABELS[a.status]}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-sm">
                      <div>
                        <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          RUC
                        </dt>
                        <dd className="font-mono text-[var(--text-secondary)] truncate">
                          {a.ruc}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Distrito
                        </dt>
                        <dd className="text-[var(--text-secondary)] truncate">
                          {a.district}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Categoría
                        </dt>
                        <dd className="text-[var(--text-secondary)] truncate">
                          {a.category}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Antigüedad
                        </dt>
                        <dd>
                          <SlaBadge submittedAt={a.submittedAt} />
                        </dd>
                      </div>
                    </dl>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)]">
                      <button
                        onClick={() => openDetails(a)}
                        className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                      >
                        <Eye className="h-4 w-4" />
                        Detalles
                      </button>
                      {a.status === "pendiente" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openDetails(a)}
                            title="Solicitar info"
                            aria-label="Solicitar info"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-500/15"
                          >
                            <MessageSquare className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => openDetails(a)}
                            title="Rechazar"
                            aria-label="Rechazar"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-500/15"
                          >
                            <X className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleApprove(a.id)}
                            title="Aprobar"
                            aria-label="Aprobar"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check className="h-5 w-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* ── Desktop: tabla ───────────────────────────────── */}
            <div className="hidden md:block rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="pl-5 pr-2 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected;
                        }}
                        onChange={toggleSelectAll}
                        aria-label="Seleccionar todas las visibles"
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 font-extrabold">
                      <SortBtn field="businessName">Negocio</SortBtn>
                    </th>
                    <th className="px-3 py-3 font-extrabold hidden lg:table-cell">
                      RUC / Contacto
                    </th>
                    <th className="px-3 py-3 font-extrabold">
                      <SortBtn field="district">Distrito</SortBtn>
                    </th>
                    <th className="px-3 py-3 font-extrabold hidden xl:table-cell">
                      Categoría
                    </th>
                    <th className="px-3 py-3 font-extrabold">
                      <SortBtn field="submittedAt">Antigüedad</SortBtn>
                    </th>
                    <th className="px-3 py-3 font-extrabold text-center">
                      Estado
                    </th>
                    <th className="pr-5 pl-3 py-3 font-extrabold text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filtered.map((a) => {
                    const isSel = selectedIds.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        className={cn(
                          "transition",
                          isSel
                            ? "bg-[var(--accent)]/5"
                            : "hover:bg-[var(--surface-sunken)]/50",
                        )}
                      >
                        <td className="pl-5 pr-2 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelectOne(a.id)}
                            aria-label={`Seleccionar ${a.businessName}`}
                            className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={a.businessName} />
                            <div className="min-w-0">
                              <button
                                onClick={() => openDetails(a)}
                                className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)] truncate block text-left"
                              >
                                {a.businessName}
                              </button>
                              <p className="text-xs text-[var(--text-tertiary)] truncate">
                                {a.ownerName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-mono text-xs text-[var(--text-secondary)] truncate">
                              {a.ruc}
                            </span>
                            <button
                              onClick={() => copy(a.ruc, "RUC")}
                              title="Copiar RUC"
                              aria-label="Copiar RUC"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                            {a.phone}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] text-xs">
                          {a.district}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] hidden xl:table-cell text-xs">
                          {a.category}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <SlaBadge submittedAt={a.submittedAt} />
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] whitespace-nowrap">
                              {fmtDate(a.submittedAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                              STATUS_STYLES[a.status],
                            )}
                          >
                            {STATUS_LABELS[a.status]}
                          </span>
                        </td>
                        <td className="pr-5 pl-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => openDetails(a)}
                              aria-label="Ver detalles"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              title="Ver detalles"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {a.status === "pendiente" && (
                              <>
                                <button
                                  onClick={() => handleApprove(a.id)}
                                  aria-label="Aprobar"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
                                  title="Aprobar"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openDetails(a)}
                                  aria-label="Solicitar info"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-500/15 dark:hover:text-sky-300"
                                  title="Solicitar info"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openDetails(a)}
                                  aria-label="Rechazar"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                                  title="Rechazar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {a.status === "rechazada" && (
                              <button
                                onClick={() => handleReopen(a.id)}
                                aria-label="Reabrir"
                                className="inline-flex h-9 px-2.5 items-center justify-center rounded-lg text-xs font-bold text-teal-700 bg-teal-100 hover:bg-teal-200 dark:text-teal-300 dark:bg-teal-500/15 dark:hover:bg-teal-500/25"
                                title="Reabrir aplicación"
                              >
                                Reabrir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {selected && (
          <ApplicationDetailsDrawer
            application={selected}
            onClose={closeDetails}
            onApprove={handleApprove}
            onReject={handleReject}
            onRequestInfo={handleRequestInfo}
            onReopen={handleReopen}
            onCopy={copy}
          />
        )}
      </div>
    </div>
  );
}
