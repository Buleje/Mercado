"use client";

/**
 * PagosYapeClient — Revisión de pagos Yape con IA visión.
 *
 * Worker IA extrae monto/opcode/last4/fecha desde la captura.
 * El superadmin compara esperado vs. detectado y aprueba/rechaza.
 *
 * Mejoras:
 *  - Búsqueda con debounce + filtros (delta, monto, fecha)
 *  - SLA badge por antigüedad
 *  - Bulk approve con checkboxes
 *  - Toast inline (sustituye banner error)
 *  - Deep-link ?id= abre detalle al cargar
 *  - Skeleton loading
 *  - Auto-refresh 30s toggle visible
 *  - Keyboard: `/` busca · `J/K` navega · `A` aprueba · `X` rechaza · `Esc`
 *  - CSV export
 *  - Mobile: detalle como drawer fullscreen
 *  - csrfHeaders en approve (antes no lo tenía)
 *  - Copy clipboard en opcode/phone
 */

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useReducer,
  useMemo,
} from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import Image from "next/image";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ZoomIn,
  Loader2,
  RefreshCw,
  X,
  Search,
  Download,
  Copy,
  Check,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentApproval {
  id: string;
  conversationId: string | null;
  customerPhone: string;
  expectedAmount: number;
  detectedAmount: number | null;
  imageUrl: string;
  visionResponse: Record<string, unknown> | null;
  yapeOpCode: string | null;
  yapeLast4: string | null;
  yapeDate: string | null;
  status: "pending" | "review_required" | "approved" | "rejected";
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialCount: number;
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };
type DeltaFilter = "all" | "exact" | "near" | "far" | "unknown";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    n,
  );

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last2 = digits.slice(-2);
  return `+51 *** **${last2}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function slaInfo(iso: string): {
  label: string;
  tone: "good" | "warn" | "bad";
  hours: number;
} {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  let label: string;
  if (hours < 1) label = "recién";
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d`;
  const tone: "good" | "warn" | "bad" =
    hours >= 24 ? "bad" : hours >= 4 ? "warn" : "good";
  return { label, tone, hours };
}

function deltaStatus(
  expected: number,
  detected: number | null,
): "exact" | "near" | "far" | "unknown" {
  if (detected == null) return "unknown";
  if (expected === 0) return detected === 0 ? "exact" : "far";
  const pct = Math.abs(expected - detected) / expected;
  if (pct === 0) return "exact";
  if (pct < 0.05) return "near";
  return "far";
}

function getConfidence(
  visionResponse: Record<string, unknown> | null,
): number | null {
  if (!visionResponse) return null;
  const c = visionResponse.confidence;
  if (typeof c === "number") return c;
  return null;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: PaymentApproval[]) {
  const headers = [
    "ID",
    "Phone",
    "Expected",
    "Detected",
    "Delta",
    "OpCode",
    "Last4",
    "Status",
    "Confidence",
    "CreatedAt",
  ];
  const data = rows.map((r) => [
    r.id,
    r.customerPhone,
    r.expectedAmount,
    r.detectedAmount ?? "",
    deltaStatus(r.expectedAmount, r.detectedAmount),
    r.yapeOpCode ?? "",
    r.yapeLast4 ?? "",
    r.status,
    getConfidence(r.visionResponse) ?? "",
    r.createdAt,
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagos_yape_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const DELTA_CLASS: Record<string, string> = {
  exact: "text-emerald-700 dark:text-emerald-300 font-extrabold",
  near: "text-teal-700 dark:text-teal-300 font-extrabold",
  far: "text-rose-700 dark:text-rose-300 font-extrabold",
  unknown: "text-[var(--text-tertiary)]",
};

const DELTA_ICON: Record<string, React.ReactNode> = {
  exact: <CheckCircle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  near: <AlertTriangle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  far: <XCircle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  unknown: <Clock className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
};

const SLA_STYLES: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  warn: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
  bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

// ─── Optimistic reducer ───────────────────────────────────────────────────────

type Action =
  | { type: "set"; payload: PaymentApproval[] }
  | { type: "remove"; ids: string[] }
  | { type: "revert"; items: PaymentApproval[] };

function approvalsReducer(
  state: PaymentApproval[],
  action: Action,
): PaymentApproval[] {
  switch (action.type) {
    case "set":
      return action.payload;
    case "remove":
      return state.filter((a) => !action.ids.includes(a.id));
    case "revert": {
      const map = new Map<string, PaymentApproval>(
        state.map((a) => [a.id, a]),
      );
      action.items.forEach((it) => map.set(it.id, it));
      return Array.from(map.values()).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PagosYapeClient(_: Props) {
  const [approvals, dispatch] = useReducer(approvalsReducer, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<PaymentApproval | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [deltaFilter, setDeltaFilter] = useState<DeltaFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reject modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  // Zoom modal
  const [zoomOpen, setZoomOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushToast = useCallback(
    (text: string, tone: ToastTone = "info") => {
      const id = toastIdRef.current++;
      setToasts((prev) => [...prev, { id, text, tone }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        3000,
      );
    },
    [],
  );

  // ── Debounce ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      try {
        const res = await fetch(
          "/api/superadmin/payment-approvals?status=pending",
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) {
          pushToast("No se pudieron cargar los pagos", "error");
          return;
        }
        const data = (await res.json()) as {
          approvals: PaymentApproval[];
          total: number;
        };
        dispatch({ type: "set", payload: data.approvals ?? [] });
      } catch {
        pushToast("Error de red", "error");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ── Polling toggle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      return;
    }
    pollingRef.current = setInterval(() => void load(true), 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [autoRefresh, load]);

  // ── Deep-link ?id= ────────────────────────────────────────────────────────
  useEffect(() => {
    if (approvals.length === 0) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (id && !selected) {
      const found = approvals.find((a) => a.id === id);
      if (found) setSelected(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals]);

  const openDetails = useCallback((a: PaymentApproval) => {
    setSelected(a);
    const url = new URL(window.location.href);
    url.searchParams.set("id", a.id);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const closeDetails = useCallback(() => {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // ── Derived filtered list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approvals.filter((a) => {
      if (deltaFilter !== "all") {
        if (deltaStatus(a.expectedAmount, a.detectedAmount) !== deltaFilter)
          return false;
      }
      if (!q) return true;
      return (
        a.customerPhone.includes(q) ||
        (a.yapeOpCode?.toLowerCase().includes(q) ?? false) ||
        (a.yapeLast4?.toLowerCase().includes(q) ?? false) ||
        a.id.toLowerCase().includes(q) ||
        String(a.expectedAmount).includes(q) ||
        String(a.detectedAmount ?? "").includes(q)
      );
    });
  }, [approvals, search, deltaFilter]);

  // ── Single approve / reject ───────────────────────────────────────────────
  const approve = useCallback(
    async (approval: PaymentApproval) => {
      setActioning(approval.id);
      dispatch({ type: "remove", ids: [approval.id] });
      if (selected?.id === approval.id) closeDetails();

      try {
        const res = await fetch(
          `/api/superadmin/payment-approvals/${approval.id}/approve`,
          {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({}),
          },
        );
        if (!res.ok) {
          dispatch({ type: "revert", items: [approval] });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          pushToast(data.error ?? "Error al aprobar", "error");
        } else {
          pushToast("Aprobado", "success");
        }
      } catch {
        dispatch({ type: "revert", items: [approval] });
        pushToast("Error de red al aprobar", "error");
      } finally {
        setActioning(null);
      }
    },
    [selected, closeDetails, pushToast],
  );

  const openReject = useCallback((id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectOpen(true);
  }, []);

  const confirmReject = useCallback(async () => {
    if (!rejectTargetId) return;
    const result = rejectReason.trim();
    if (result.length < 5) return;

    const approval = approvals.find((a) => a.id === rejectTargetId);
    if (!approval) return;

    setActioning(rejectTargetId);
    setRejectOpen(false);

    dispatch({ type: "remove", ids: [rejectTargetId] });
    if (selected?.id === rejectTargetId) closeDetails();

    try {
      const res = await fetch(
        `/api/superadmin/payment-approvals/${rejectTargetId}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ reason: result }),
        },
      );
      if (!res.ok) {
        dispatch({ type: "revert", items: [approval] });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        pushToast(data.error ?? "Error al rechazar", "error");
      } else {
        pushToast("Rechazado · cliente notificado", "success");
      }
    } catch {
      dispatch({ type: "revert", items: [approval] });
      pushToast("Error de red al rechazar", "error");
    } finally {
      setActioning(null);
      setRejectTargetId(null);
    }
  }, [
    rejectTargetId,
    rejectReason,
    approvals,
    selected,
    closeDetails,
    pushToast,
  ]);

  // ── Bulk approve (sólo cuando delta=exact) ────────────────────────────────
  const bulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `¿Aprobar ${ids.length} pago${ids.length === 1 ? "" : "s"}?\n\nSugerido sólo para deltas exactos.`,
      )
    )
      return;
    const items = approvals.filter((a) => ids.includes(a.id));
    setBulkBusy(true);
    dispatch({ type: "remove", ids });
    setSelectedIds(new Set());
    let ok = 0;
    let fail = 0;
    const failed: PaymentApproval[] = [];
    for (const a of items) {
      try {
        const r = await fetch(
          `/api/superadmin/payment-approvals/${a.id}/approve`,
          {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({}),
          },
        );
        if (r.ok) ok++;
        else {
          fail++;
          failed.push(a);
        }
      } catch {
        fail++;
        failed.push(a);
      }
    }
    if (failed.length > 0) dispatch({ type: "revert", items: failed });
    setBulkBusy(false);
    pushToast(
      `Aprobados ${ok}${fail > 0 ? ` · ${fail} fallaron` : ""}`,
      fail > 0 ? "error" : "success",
    );
  };

  // ── Copy ──────────────────────────────────────────────────────────────────
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${what} copiado`, "success");
    } catch {
      pushToast("No se pudo copiar", "error");
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "Escape") {
        if (zoomOpen) {
          setZoomOpen(false);
          return;
        }
        if (rejectOpen) {
          setRejectOpen(false);
          return;
        }
        if (selected) {
          closeDetails();
          return;
        }
        if (searchRaw || deltaFilter !== "all") {
          setSearchRaw("");
          setDeltaFilter("all");
        }
        return;
      }
      if (inField) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (filtered.length === 0) return;
      const currentIdx = selected
        ? filtered.findIndex((a) => a.id === selected.id)
        : -1;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, currentIdx + 1)];
        if (next) openDetails(next);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const prev = filtered[Math.max(0, currentIdx - 1)];
        if (prev) openDetails(prev);
      } else if ((e.key === "a" || e.key === "A") && selected) {
        e.preventDefault();
        void approve(selected);
      } else if ((e.key === "x" || e.key === "X") && selected) {
        e.preventDefault();
        openReject(selected.id);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    filtered,
    selected,
    zoomOpen,
    rejectOpen,
    searchRaw,
    deltaFilter,
    approve,
    openReject,
    openDetails,
    closeDetails,
    load,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isEmpty = !loading && approvals.length === 0;
  const noResults = !loading && approvals.length > 0 && filtered.length === 0;

  return (
    <div className="space-y-5">
      <Toasts toasts={toasts} />

      {/* ── Action bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          title="Recargar (R)"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50 transition"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
            aria-hidden
          />
          Recargar
        </button>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Auto 30s
          {autoRefresh && refreshing && (
            <Loader2 className="h-3 w-3 animate-spin opacity-60" aria-hidden />
          )}
        </label>
        <button
          type="button"
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50 transition"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV ({filtered.length})
        </button>
      </div>

      {/* ── Search + filtros ───────────────────────────────── */}
      {!isEmpty && (
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 space-y-2.5">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              placeholder="Buscar phone, opcode, last4, monto…"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              aria-label="Buscar pagos"
              className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-9 pr-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "all", label: "Todos" },
                { v: "exact", label: "Match exacto" },
                { v: "near", label: "Cercano (<5%)" },
                { v: "far", label: "Lejano" },
                { v: "unknown", label: "IA no detectó" },
              ] as Array<{ v: DeltaFilter; label: string }>
            ).map((opt) => {
              const active = deltaFilter === opt.v;
              return (
                <button
                  key={opt.v}
                  onClick={() => setDeltaFilter(opt.v)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-2 text-xs font-bold transition",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bulk bar ─────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/5 backdrop-blur px-4 py-3 shadow-sm">
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {selectedIds.size} seleccionado
            {selectedIds.size === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="h-10 px-3 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Limpiar
            </button>
            <button
              onClick={bulkApprove}
              disabled={bulkBusy}
              className="h-10 px-3.5 rounded-lg text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {bulkBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Aprobar todos
            </button>
          </div>
        </div>
      )}

      {/* ── Skeleton ────────────────────────────────────── */}
      {loading && approvals.length === 0 && <Skeleton />}

      {/* ── Empty ──────────────────────────────────────── */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[var(--rule-base)] py-16 text-center px-6">
          <svg
            width="80"
            height="60"
            viewBox="0 0 80 60"
            fill="none"
            aria-hidden="true"
            className="opacity-30"
          >
            <ellipse
              cx="38"
              cy="38"
              rx="28"
              ry="16"
              fill="var(--accent)"
              fillOpacity="0.4"
            />
            <ellipse
              cx="38"
              cy="34"
              rx="20"
              ry="12"
              fill="var(--accent)"
              fillOpacity="0.6"
            />
            <circle cx="48" cy="31" r="2" fill="var(--text-primary)" fillOpacity="0.5" />
            <path
              d="M10 38 Q4 30 10 22"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <div>
            <p className="text-base font-extrabold text-[var(--text-primary)]">
              Todo al día. Sin pagos pendientes.
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              Los pagos Yape aparecen aquí cuando un cliente sube su captura.
            </p>
          </div>
        </div>
      )}

      {noResults && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-12 text-center">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Ningún pago coincide con los filtros activos
          </p>
          <button
            onClick={() => {
              setSearchRaw("");
              setDeltaFilter("all");
            }}
            className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── 2-col layout (lg+) / 1-col mobile ──────────── */}
      {!isEmpty && !noResults && filtered.length > 0 && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4">
          {/* Lista */}
          <ul className="lg:col-span-5 xl:col-span-4 flex flex-col gap-2 lg:max-h-[calc(100vh-22rem)] lg:overflow-y-auto pr-1">
            {filtered.map((a) => {
              const delta = deltaStatus(a.expectedAmount, a.detectedAmount);
              const sla = slaInfo(a.createdAt);
              const isSelected = selected?.id === a.id;
              const isBusy = actioning === a.id;
              const isSel = selectedIds.has(a.id);

              return (
                <li
                  key={a.id}
                  className={cn(
                    "rounded-xl border-2 transition-all relative",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-md"
                      : isSel
                        ? "border-[var(--accent)]/60 bg-[var(--accent)]/5"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50",
                    isBusy && "opacity-40 pointer-events-none",
                  )}
                >
                  <label className="absolute top-2 left-2 z-10 inline-flex h-11 w-11 items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(a.id);
                      }}
                      aria-label={`Seleccionar ${maskPhone(a.customerPhone)}`}
                      className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => openDetails(a)}
                    disabled={isBusy}
                    className="w-full text-left p-3.5 pl-12"
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="text-xs font-bold text-[var(--text-secondary)] font-mono"
                        data-no-translate
                      >
                        {maskPhone(a.customerPhone)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shrink-0",
                          SLA_STYLES[sla.tone],
                        )}
                      >
                        <Clock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                        {sla.label}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        Esperado{" "}
                        <span
                          className="font-extrabold text-[var(--text-primary)] tabular-nums"
                          data-no-translate
                        >
                          {fmtPEN(a.expectedAmount)}
                        </span>
                      </span>
                      {a.detectedAmount != null && (
                        <>
                          <span className="text-[var(--text-tertiary)]">·</span>
                          <span
                            className={`text-[11px] tabular-nums ${DELTA_CLASS[delta]}`}
                            data-no-translate
                          >
                            {DELTA_ICON[delta]}
                            {fmtPEN(a.detectedAmount)}
                          </span>
                        </>
                      )}
                    </div>

                    {a.status === "review_required" && (
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-extrabold text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">
                        <AlertTriangle className="w-3 h-3" />
                        Revisión requerida
                      </div>
                    )}

                    {(() => {
                      const conf = getConfidence(a.visionResponse);
                      if (conf != null && conf < 0.7) {
                        return (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                            <AlertTriangle className="w-3 h-3" />
                            IA {Math.round(conf * 100)}%
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {a.yapeOpCode && (
                      <p
                        className="mt-1 text-[10px] font-mono text-[var(--text-tertiary)]"
                        data-no-translate
                      >
                        Op. {a.yapeOpCode}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Detalle (desktop) — drawer (mobile) */}
          <div className="hidden lg:block lg:col-span-7 xl:col-span-8">
            {!selected ? (
              <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-sm text-[var(--text-tertiary)]">
                Seleccioná un pago para revisar (o presioná{" "}
                <kbd className="mx-1 px-1 rounded bg-[var(--surface-sunken)] font-mono text-xs">
                  J
                </kbd>
                )
              </div>
            ) : (
              <DetailPanel
                approval={selected}
                actioning={actioning === selected.id}
                onApprove={() => void approve(selected)}
                onRejectOpen={() => openReject(selected.id)}
                onZoom={() => setZoomOpen(true)}
                onCopy={copy}
                onClose={closeDetails}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Mobile drawer (detalle fullscreen) ─────────── */}
      {selected && (
        <div className="lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del pago"
            className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeDetails}
          >
            <div
              className="w-full h-full overflow-y-auto bg-[var(--surface-canvas)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] px-4 py-3">
                <p className="font-extrabold text-base text-[var(--text-primary)] truncate">
                  {maskPhone(selected.customerPhone)}
                </p>
                <button
                  onClick={closeDetails}
                  aria-label="Cerrar"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4">
                <DetailPanel
                  approval={selected}
                  actioning={actioning === selected.id}
                  onApprove={() => void approve(selected)}
                  onRejectOpen={() => openReject(selected.id)}
                  onZoom={() => setZoomOpen(true)}
                  onCopy={copy}
                  onClose={closeDetails}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ──────────────────────────────────── */}
      {rejectOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setRejectOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-5 sm:p-6 shadow-[var(--shadow-xl)]"
          >
            <h2
              id="reject-dialog-title"
              className="text-lg font-extrabold text-[var(--text-primary)] mb-1"
            >
              Rechazar pago
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              El cliente recibirá este motivo por WhatsApp.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: El monto no coincide con el pedido. Por favor, subí la captura correcta."
              rows={4}
              autoFocus
              className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm resize-none outline-none focus:border-[var(--accent)] transition-colors"
              aria-label="Motivo del rechazo"
              maxLength={500}
            />
            <p className="mt-1 text-right text-[10px] text-[var(--text-tertiary)]">
              {rejectReason.length}/500
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="flex-1 h-11 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmReject()}
                disabled={rejectReason.trim().length < 5 || actioning != null}
                className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold uppercase tracking-wider disabled:opacity-40 transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom modal ──────────────────────────────────── */}
      {zoomOpen && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Captura ampliada"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Cerrar imagen ampliada"
            className="absolute top-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="relative w-full max-w-lg max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={selected.imageUrl}
              alt="Captura Yape ampliada"
              width={600}
              height={900}
              className="w-full h-auto max-h-[85vh] object-contain rounded-xl"
              unoptimized
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 animate-pulse">
      <div className="lg:col-span-5 xl:col-span-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] h-24"
          />
        ))}
      </div>
      <div className="hidden lg:block lg:col-span-7 xl:col-span-8">
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] h-96" />
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  approval: PaymentApproval;
  actioning: boolean;
  onApprove: () => void;
  onRejectOpen: () => void;
  onZoom: () => void;
  onCopy: (text: string, what: string) => void;
  onClose: () => void;
}

function DetailPanel({
  approval,
  actioning,
  onApprove,
  onRejectOpen,
  onZoom,
  onCopy,
}: DetailPanelProps) {
  const delta = deltaStatus(approval.expectedAmount, approval.detectedAmount);
  const conf = getConfidence(approval.visionResponse);

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Image */}
      <div className="relative bg-[var(--surface-sunken)] group">
        <Image
          src={approval.imageUrl}
          alt="Captura del pago Yape"
          width={800}
          height={600}
          className="w-full max-h-[55vh] object-contain"
          unoptimized
          loading="lazy"
        />
        <button
          type="button"
          onClick={onZoom}
          aria-label="Ampliar imagen"
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-10 px-3 rounded-lg bg-black/70 text-white text-xs font-bold hover:bg-black/85 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <ZoomIn className="w-3.5 h-3.5" />
          Ampliar
        </button>
      </div>

      {/* Data table + actions */}
      <div className="p-4 sm:p-5">
        <h3 className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Datos extraídos por IA
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <th className="text-left px-3 sm:px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Campo
                </th>
                <th className="text-left px-3 sm:px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Esperado
                </th>
                <th className="text-left px-3 sm:px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Detectado IA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-base)]">
              <tr>
                <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Monto
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 font-bold tabular-nums text-[var(--text-primary)]"
                  data-no-translate
                >
                  {fmtPEN(approval.expectedAmount)}
                </td>
                <td
                  className={`px-3 sm:px-4 py-2.5 tabular-nums ${DELTA_CLASS[delta]}`}
                  data-no-translate
                >
                  {approval.detectedAmount != null ? (
                    <>
                      {DELTA_ICON[delta]}
                      {fmtPEN(approval.detectedAmount)}
                    </>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Fecha
                </td>
                <td className="px-3 sm:px-4 py-2.5 text-[var(--text-tertiary)]">
                  {relativeTime(approval.createdAt)}
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 text-[var(--text-primary)] font-mono text-xs break-all"
                  data-no-translate
                >
                  {approval.yapeDate ?? (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Operación
                </td>
                <td className="px-3 sm:px-4 py-2.5 text-[var(--text-tertiary)]">
                  —
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 font-mono text-xs text-[var(--text-primary)]"
                  data-no-translate
                >
                  {approval.yapeOpCode ? (
                    <span className="inline-flex items-center gap-1">
                      {approval.yapeOpCode}
                      <button
                        onClick={() =>
                          onCopy(approval.yapeOpCode!, "Operación")
                        }
                        aria-label="Copiar operación"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Últimos 4 destino
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]"
                  data-no-translate
                >
                  —
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 font-mono text-xs"
                  data-no-translate
                >
                  {approval.yapeLast4 ? (
                    <span className="font-extrabold text-[var(--text-primary)]">
                      {approval.yapeLast4}
                      <CheckCircle className="w-3.5 h-3.5 inline ml-1 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Teléfono
                </td>
                <td
                  className="px-3 sm:px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]"
                  data-no-translate
                >
                  {maskPhone(approval.customerPhone)}
                </td>
                <td className="px-3 sm:px-4 py-2.5">
                  <button
                    onClick={() => onCopy(approval.customerPhone, "Teléfono")}
                    aria-label="Copiar teléfono"
                    className="inline-flex h-8 px-2 items-center gap-1 rounded-md text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] font-bold"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </button>
                </td>
              </tr>

              {conf != null && (
                <tr>
                  <td className="px-3 sm:px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                    Confianza IA
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-[var(--text-tertiary)]">
                    —
                  </td>
                  <td
                    className={cn(
                      "px-3 sm:px-4 py-2.5 font-extrabold",
                      conf >= 0.85
                        ? "text-emerald-700 dark:text-emerald-300"
                        : conf >= 0.7
                          ? "text-teal-700 dark:text-teal-300"
                          : "text-rose-700 dark:text-rose-300",
                    )}
                    data-no-translate
                  >
                    {Math.round(conf * 100)}%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Metadata */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
          {approval.conversationId && (
            <span data-no-translate>
              Conv:{" "}
              <span className="font-mono">
                {approval.conversationId.slice(0, 12)}…
              </span>
            </span>
          )}
          {approval.rejectionReason && (
            <span className="text-teal-700 dark:text-teal-300">
              Razón IA: {approval.rejectionReason}
            </span>
          )}
          <span>Recibido: {relativeTime(approval.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={actioning}
            title="Aprobar (A)"
            className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold uppercase tracking-wider disabled:opacity-40 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {actioning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Aprobar
          </button>
          <button
            type="button"
            onClick={onRejectOpen}
            disabled={actioning}
            title="Rechazar (X)"
            className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold uppercase tracking-wider disabled:opacity-40 transition focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          >
            {actioning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
