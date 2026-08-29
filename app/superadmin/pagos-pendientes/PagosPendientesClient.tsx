"use client";

/**
 * PagosPendientesClient — Aprobación de comprobantes manuales
 * (Yape/Plin/transferencia) que llegan del onboarding.
 *
 * Features:
 *  - Layout canónico /superadmin (max-w-1400 unificado)
 *  - Búsqueda con debounce (negocio, propietario, ref, teléfono)
 *  - Filtros: status + método + plan
 *  - SLA badge por antigüedad (verde<24h, ámbar<72h, rojo>72h)
 *  - Bulk approve/reject de pendientes
 *  - Deep-link ?id= abre modal
 *  - Auto-refresh 60s opt-in
 *  - Toast inline (sin alert()/confirm() en flujos)
 *  - CSV export
 *  - Copy clipboard (RUC, teléfono, email, ref)
 *  - Skeleton loading
 *  - Tap targets ≥44px, focus rings, aria-live
 *  - Atajos: `/` busca · `R` recarga · `Esc` cierra modal/limpia filtros
 */

import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  Loader2,
  Check,
  X,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Search,
  Receipt,
  Wallet,
  Clock,
  Phone,
  MapPin,
  Hash,
  Calendar,
  Banknote,
  Eye,
  Download,
  Copy,
  AlertTriangle,
  Gift,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { SuperAdminModuleTabs, FINANZAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";

// ── Types ──────────────────────────────────────────────────────────────────

interface PaymentProof {
  id: string;
  tenantSlug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string | null;
  storeName: string;
  category: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  planTier: string;
  billingCycle: string;
  amountPEN: number;
  method: string;
  proofUrl: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

// ── Constants ──────────────────────────────────────────────────────────────

const PLAN_LABEL: Record<string, string> = {
  basico: "Free",
  pro: "Starter",
  enterprise: "Pro",
  max: "Business",
};

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
};

const STATUS_META = {
  pending: {
    label: "Pendiente",
    pill: "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
    dot: "bg-[var(--accent)]",
  },
  approved: {
    label: "Aprobado",
    pill: "border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rechazado",
    pill: "border-[var(--data-error-500)] bg-[var(--data-error-100)] text-[var(--data-error)]",
    dot: "bg-rose-500",
  },
} as const;

const SLA_STYLES: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  warn: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  bad: "bg-[var(--data-error-50)] text-[var(--data-error)]",
};

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

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

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: PaymentProof[]) {
  const headers = [
    "ID",
    "Tienda",
    "Slug",
    "Propietario",
    "Telefono",
    "Email",
    "Plan",
    "Ciclo",
    "Monto",
    "Metodo",
    "Referencia",
    "Estado",
    "Recibido",
  ];
  const data = rows.map((r) => [
    r.id,
    r.storeName,
    r.tenantSlug,
    r.ownerName,
    r.ownerPhone,
    r.ownerEmail ?? "",
    PLAN_LABEL[r.planTier] ?? r.planTier,
    r.billingCycle,
    r.amountPEN,
    METHOD_LABEL[r.method] ?? r.method,
    r.reference ?? "",
    r.status,
    r.createdAt,
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagos_pendientes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PagosPendientesClient() {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [actioning, setActioning] = useState<string | null>(null);
  const [active, setActive] = useState<PaymentProof | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Credenciales generadas al aprobar (respaldo si el WhatsApp falla).
  // password = null cuando el dueño eligió su propia contraseña en el registro.
  const [newCreds, setNewCreds] = useState<{
    storeName: string;
    username: string;
    password: string | null;
    loginUrl: string;
    ownerChose: boolean;
  } | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Toast ─────────────────────────────────────────────────────────────
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

  // ── Debounce ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/superadmin/payment-proofs?status=${filter}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) {
          setError("No se pudieron cargar los pagos.");
          return;
        }
        const data = (await res.json()) as { proofs: PaymentProof[] };
        setProofs(data.proofs ?? []);
      } catch (err) {
        console.error("[sa-pagos-pendientes] load failed", err);
        setError("Error de red.");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ── Deep-link ?id= ───────────────────────────────────────────────────
  useEffect(() => {
    if (proofs.length === 0) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (id && !active) {
      const found = proofs.find((p) => p.id === id);
      if (found) setActive(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofs]);

  const openProof = (p: PaymentProof) => {
    setActive(p);
    setRejectReason("");
    setRejectOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("id", p.id);
    window.history.replaceState({}, "", url.toString());
  };

  const closeProof = () => {
    setActive(null);
    setRejectOpen(false);
    setRejectReason("");
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState({}, "", url.toString());
  };

  // ── Auto refresh ─────────────────────────────────────────────────────
  useVisiblePolling(() => void load(true), 60_000, autoRefresh);

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape") {
        if (active) {
          closeProof();
        } else if (searchRaw || methodFilter !== "all" || planFilter !== "all") {
          setSearchRaw("");
          setMethodFilter("all");
          setPlanFilter("all");
        }
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
     
  }, [active, load, searchRaw, methodFilter, planFilter]);

  // ── Single actions ───────────────────────────────────────────────────
  const approve = async (id: string) => {
    if (!window.confirm("¿Aprobar este pago y crear la tienda?")) return;
    setActioning(id);
    try {
      const res = await fetch(
        `/api/superadmin/payment-proofs/${id}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({}),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        credentials?: {
          username: string;
          password: string | null;
          loginUrl: string;
          ownerChose: boolean;
        } | null;
      };
      if (!res.ok) {
        pushToast(data.error ?? "Error al aprobar", "error");
        return;
      }
      const storeName = proofs.find((p) => p.id === id)?.storeName ?? active?.storeName ?? "la tienda";
      pushToast("Pago aprobado · tienda creada", "success");
      closeProof();
      // Si se generaron credenciales, mostrarlas (respaldo del WhatsApp).
      if (data.credentials) {
        setNewCreds({ storeName, ...data.credentials });
      }
      await load(true);
    } finally {
      setActioning(null);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason || rejectReason.length < 5) {
      pushToast("Escribí un motivo (mínimo 5 caracteres)", "error");
      return;
    }
    setActioning(id);
    try {
      const res = await fetch(
        `/api/superadmin/payment-proofs/${id}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ reason: rejectReason }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        pushToast(data.error ?? "Error al rechazar", "error");
        return;
      }
      pushToast("Pago rechazado · notificado", "success");
      setRejectReason("");
      setRejectOpen(false);
      closeProof();
      await load(true);
    } finally {
      setActioning(null);
    }
  };

  // ── Bulk actions ─────────────────────────────────────────────────────
  const bulkApprove = async () => {
    const ids = Array.from(selectedIds).filter(
      (id) => proofs.find((p) => p.id === id)?.status === "pending",
    );
    if (ids.length === 0) {
      pushToast("Solo se aprueban en lote los pendientes", "info");
      return;
    }
    if (!window.confirm(`¿Aprobar ${ids.length} pagos y crear sus tiendas?`))
      return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const r = await fetch(
          `/api/superadmin/payment-proofs/${id}/approve`,
          {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({}),
          },
        );
        if (r.ok) ok++;
        else fail++;
      } catch (err) {
        console.error("[sa-pagos-pendientes] bulkApprove item failed", err);
        fail++;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    pushToast(
      `Aprobados ${ok}${fail > 0 ? ` · ${fail} fallaron` : ""}`,
      fail > 0 ? "error" : "success",
    );
    await load(true);
  };

  // ── Copy clipboard ───────────────────────────────────────────────────
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${label} copiado`, "success");
    } catch (err) {
      console.error("[sa-pagos-pendientes] clipboard copy failed", err);
      pushToast("No se pudo copiar", "error");
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const methodOptions = useMemo(
    () => Array.from(new Set(proofs.map((p) => p.method))).sort(),
    [proofs],
  );
  const planOptions = useMemo(
    () => Array.from(new Set(proofs.map((p) => p.planTier))).sort(),
    [proofs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proofs.filter((p) => {
      if (methodFilter !== "all" && p.method !== methodFilter) return false;
      if (planFilter !== "all" && p.planTier !== planFilter) return false;
      if (!q) return true;
      return (
        p.storeName.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.ownerPhone.includes(q) ||
        (p.ownerEmail?.toLowerCase().includes(q) ?? false) ||
        (p.reference?.toLowerCase().includes(q) ?? false) ||
        p.tenantSlug.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [proofs, search, methodFilter, planFilter]);

  const stats = useMemo(() => {
    const pending = proofs.filter((p) => p.status === "pending");
    const approved = proofs.filter((p) => p.status === "approved");
    const sumPending = pending.reduce((a, p) => a + p.amountPEN, 0);
    return {
      total: proofs.length,
      pending: pending.length,
      approved: approved.length,
      sumPending,
      visible: filtered.length,
    };
  }, [proofs, filtered]);

  // ── Selection ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={FINANZAS_TABS} />
      {/* ─── Toasts ─────────────────────────────────────────── */}
      <Toasts toasts={toasts} />

      {/* ─── Credenciales generadas al aprobar ──────────────── */}
      {newCreds && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md"
          onClick={() => setNewCreds(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Credenciales de la nueva tienda"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
          >
            <div className="bg-[var(--accent)] px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-85">
                Tienda creada
              </p>
              <h3 className="text-lg font-extrabold leading-tight">Credenciales de {newCreds.storeName}</h3>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {newCreds.ownerChose
                  ? "Ya avisamos al dueño por WhatsApp. La contraseña es la que él eligió al registrarse (no la guardamos en claro)."
                  : "Ya se enviaron por WhatsApp al dueño. Guardalas por si acaso — la contraseña no se vuelve a mostrar."}{" "}
                Tocá cada campo para copiar.
              </p>
              {[
                { label: "Panel", value: newCreds.loginUrl },
                { label: "Usuario", value: newCreds.username },
                ...(newCreds.password ? [{ label: "Contraseña", value: newCreds.password }] : []),
              ].map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(row.value)
                      .then(() => pushToast(`${row.label} copiado`, "success"))
                      .catch((err) => console.warn("[creds] copy failed", String(err)));
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {row.label}
                    </span>
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{row.value}</span>
                  </span>
                  <Copy className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2.25} aria-hidden />
                </button>
              ))}
              {!newCreds.password && (
                <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
                  <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Contraseña
                  </span>
                  <span className="block text-sm font-semibold text-[var(--text-secondary)]">
                    La que el dueño eligió al registrarse
                  </span>
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setNewCreds(null)}
                className="h-11 w-full rounded-xl bg-[var(--text-primary)] text-sm font-bold text-[var(--surface-canvas)] transition hover:opacity-90"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Hero canónico ──────────────────────────────────── */}
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Receipt
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Tesorería · Aprobaciones
                </p>
                <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Pagos pendientes
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Revisá las capturas de Yape/Plin/transferencia. Al aprobar
                  se crea el tenant automáticamente y se envía el WhatsApp de
                  bienvenida. Atajos:{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    /
                  </kbd>{" "}
                  buscar ·{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    R
                  </kbd>{" "}
                  recargar
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2 flex-wrap shrink-0">
              <StatPill
                label="Pendientes"
                value={stats.pending}
                accent="warning"
              />
              <StatPill label="En revisión" value={fmt(stats.sumPending)} />
              <StatPill
                label="Aprobados"
                value={stats.approved}
                accent="success"
              />
            </div>
          </div>
        </div>
      </header>

      <div className={cn(SUPERADMIN_CONTENT, "space-y-5 sm:space-y-6")}>
        {/* ─── Action bar ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load()}
            disabled={refreshing}
            title="Recargar (R)"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
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
            Auto 60s
          </label>
          <button
            onClick={() => exportCSV(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV ({filtered.length})
          </button>
        </div>

        {/* ─── Toolbar (search + filtros) ──────────────────────── */}
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                inputMode="search"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder="Buscar tienda, propietario, teléfono, ref, slug…"
                aria-label="Buscar pagos"
                className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-9 pr-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "pending" | "all")}
              aria-label="Filtrar por estado"
              className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="pending">Pendientes</option>
              <option value="all">Todos (200 últimos)</option>
            </select>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              aria-label="Filtrar por método"
              className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="all">Todos los métodos</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m] ?? m}
                </option>
              ))}
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label="Filtrar por plan"
              className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="all">Todos los planes</option>
              {planOptions.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p] ?? p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Bulk bar ───────────────────────────────────────── */}
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
                Aprobar y crear tiendas
              </button>
            </div>
          </div>
        )}

        {/* ─── Error ──────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl border-2 border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-semibold text-[var(--data-error)]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {/* ─── Body ───────────────────────────────────────────── */}
        {loading && proofs.length === 0 ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)]">
              <Search
                className="h-7 w-7 text-[var(--text-tertiary)]"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <p className="mt-3 font-display text-base font-extrabold text-[var(--text-primary)]">
              {filter === "pending"
                ? "No hay pagos pendientes"
                : "Sin resultados"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {filter === "pending"
                ? "Cuando un cliente suba un comprobante de Yape/Plin, aparecerá aquí."
                : "Ajustá los filtros o limpiá la búsqueda."}
            </p>
            {(search || methodFilter !== "all" || planFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchRaw("");
                  setMethodFilter("all");
                  setPlanFilter("all");
                }}
                className="mt-4 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProofCard
                key={p.id}
                proof={p}
                selected={selectedIds.has(p.id)}
                onToggleSelect={() => toggleSelect(p.id)}
                onClick={() => openProof(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Modal ──────────────────────────────────────────── */}
      {active && (
        <ProofModal
          proof={active}
          actioning={actioning === active.id}
          rejectOpen={rejectOpen}
          rejectReason={rejectReason}
          setRejectOpen={setRejectOpen}
          setRejectReason={setRejectReason}
          onClose={closeProof}
          onApprove={() => approve(active.id)}
          onReject={() => reject(active.id)}
          onCopy={copy}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "warning" | "default";
}) {
  const cls =
    accent === "success"
      ? "border-emerald-300/50 bg-emerald-50 text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300"
      : accent === "warning"
        ? "border-[var(--accent)]/60 bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)]";
  return (
    <div className={`rounded-xl border-2 px-3.5 py-2 min-w-[100px] ${cls}`}>
      <p className="text-xs font-extrabold uppercase tracking-wider opacity-70 leading-none">
        {label}
      </p>
      <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none">
        {value}
      </p>
    </div>
  );
}

function SlaBadge({ submittedAt }: { submittedAt: string }) {
  const sla = slaInfo(submittedAt);
  return (
    <span
      title={`Hace ${sla.hours}h`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider",
        SLA_STYLES[sla.tone],
      )}
    >
      <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      {sla.label}
    </span>
  );
}

function ProofCard({
  proof,
  selected,
  onToggleSelect,
  onClick,
}: {
  proof: PaymentProof;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  const status =
    STATUS_META[proof.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const isPending = proof.status === "pending";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:shadow-xl",
        selected
          ? "border-[var(--accent)]"
          : "border-[var(--rule-base)] hover:border-[var(--accent)]/50",
      )}
    >
      {/* Checkbox solo para pendientes */}
      {isPending && (
        <label className="absolute top-3 left-3 z-20 inline-flex h-11 w-11 items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Seleccionar ${proof.storeName}`}
            className="h-5 w-5 accent-[var(--accent)] cursor-pointer drop-shadow-[var(--shadow-sm)]"
          />
        </label>
      )}

      <button
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`Ver detalles de ${proof.storeName}`}
      >
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-sunken)]">
          {proof.proofUrl ? (
            <Image
              src={proof.proofUrl}
              alt={`Comprobante de ${proof.storeName}`}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-[var(--dur-base)] group-hover:scale-[1.02]"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/10 text-[var(--accent)]">
              <Gift className="h-8 w-8" strokeWidth={1.75} aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wider">
                Plan gratis · sin comprobante
              </span>
            </div>
          )}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/70 via-black/30 to-transparent"
          />
          <div
            className={cn(
              "absolute top-3 flex items-start gap-2",
              isPending ? "right-3" : "inset-x-3 justify-between",
            )}
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider ${status.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
              <Banknote className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              {METHOD_LABEL[proof.method] ?? proof.method}
            </span>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80 truncate">
                {PLAN_LABEL[proof.planTier] ?? proof.planTier} ·{" "}
                {proof.billingCycle === "anual" ? "Anual" : "Mensual"}
              </p>
              <p className="font-display text-2xl font-extrabold leading-none tabular-nums">
                {proof.amountPEN === 0 ? "Gratis" : fmt(proof.amountPEN)}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-bold backdrop-blur-sm transition group-hover:bg-white/25 shrink-0">
              <Eye className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Revisar
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-extrabold leading-tight text-[var(--text-primary)] truncate">
                {proof.storeName}
              </h3>
              <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                {proof.ownerName}
              </p>
            </div>
            {isPending && <SlaBadge submittedAt={proof.createdAt} />}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-2.5 text-xs text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1 truncate">
              <Phone className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {proof.ownerPhone}
            </span>
            <span className="inline-flex items-center gap-1 shrink-0">
              <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {fmtDate(proof.createdAt)}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
        >
          <div className="aspect-[4/3] bg-[var(--surface-sunken)] animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 w-2/3 rounded bg-[var(--surface-sunken)] animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[var(--surface-sunken)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProofModal({
  proof,
  actioning,
  rejectOpen,
  rejectReason,
  setRejectOpen,
  setRejectReason,
  onClose,
  onApprove,
  onReject,
  onCopy,
}: {
  proof: PaymentProof;
  actioning: boolean;
  rejectOpen: boolean;
  rejectReason: string;
  setRejectOpen: (v: boolean) => void;
  setRejectReason: (v: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const status =
    STATUS_META[proof.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const isPending = proof.status === "pending";

  // Bloqueo de scroll del body cuando modal abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
      className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center bg-black/65 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] flex-col overflow-hidden sm:rounded-3xl border-0 sm:border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 sm:px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider ${status.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                {PLAN_LABEL[proof.planTier] ?? proof.planTier} ·{" "}
                {proof.billingCycle === "anual" ? "Anual" : "Mensual"}
              </p>
              <h2
                id="proof-modal-title"
                className="font-display text-base sm:text-lg font-extrabold leading-tight text-[var(--text-primary)] truncate"
              >
                {proof.storeName}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] shrink-0"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-0 overflow-y-auto flex-1">
          {/* Image */}
          <div className="relative min-h-[280px] sm:min-h-0 aspect-square bg-[var(--surface-sunken)] sm:col-span-2 sm:aspect-auto">
            {proof.proofUrl ? (
              <>
                <Image
                  src={proof.proofUrl}
                  alt={`Comprobante de ${proof.storeName}`}
                  fill
                  sizes="(min-width: 640px) 40vw, 100vw"
                  className="object-contain p-3"
                  unoptimized
                />
                <a
                  href={proof.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm hover:bg-black/85"
                >
                  <ExternalLink className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  Abrir original
                </a>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-primary/10">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-white">
                  <Gift className="h-8 w-8" strokeWidth={2} aria-hidden />
                </span>
                <div>
                  <p className="text-base font-extrabold text-[var(--text-primary)]">Registro de plan gratis</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                    No hay comprobante: el primer mes es gratis (S/ 0). Aprobá para crear la tienda.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-4 p-4 sm:p-5 sm:col-span-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                icon={Wallet}
                label="Monto"
                value={proof.amountPEN === 0 ? "Gratis" : fmt(proof.amountPEN)}
                accent
              />
              <Field
                icon={Banknote}
                label="Método"
                value={METHOD_LABEL[proof.method] ?? proof.method}
              />
              <Field
                icon={Phone}
                label="Teléfono"
                value={proof.ownerPhone}
                onCopy={() => onCopy(proof.ownerPhone, "Teléfono")}
              />
              <Field
                icon={Hash}
                label="Referencia"
                value={proof.reference ?? "—"}
                onCopy={
                  proof.reference
                    ? () => onCopy(proof.reference!, "Referencia")
                    : undefined
                }
              />
              <Field icon={Receipt} label="Dueño" value={proof.ownerName} />
              <Field
                icon={MapPin}
                label="Email"
                value={proof.ownerEmail ?? "—"}
                onCopy={
                  proof.ownerEmail
                    ? () => onCopy(proof.ownerEmail!, "Email")
                    : undefined
                }
              />
            </div>

            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3.5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Ubicación
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {[proof.distrito, proof.provincia, proof.departamento]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
              {proof.direccion && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {proof.direccion}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                icon={Calendar}
                label="Recibido"
                value={fmtDate(proof.createdAt)}
              />
              <Field icon={Wallet} label="Categoría" value={proof.category} />
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              <span className="font-bold uppercase tracking-wider">slug</span>
              <code className="font-mono text-[var(--text-secondary)] truncate flex-1">
                {proof.tenantSlug}
              </code>
              <button
                onClick={() => onCopy(proof.tenantSlug, "Slug")}
                aria-label="Copiar slug"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sticky actions */}
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
          {isPending ? (
            <div className="space-y-2.5">
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  disabled={actioning}
                  onClick={onApprove}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 h-12 px-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {actioning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                  )}
                  Aprobar y crear tienda
                </button>
                <a
                  href={`https://wa.me/51${proof.ownerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] h-12 px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <MessageCircle
                    className="h-4 w-4"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setRejectOpen(!rejectOpen)}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl border-2 h-12 px-4 text-sm font-bold transition",
                    rejectOpen
                      ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error)]",
                  )}
                >
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Rechazar
                </button>
              </div>
              {rejectOpen && (
                <div className="rounded-xl border-2 border-[var(--data-error-100)] bg-[var(--data-error-50)] p-3">
                  <label
                    htmlFor="reject-reason"
                    className="text-xs font-extrabold uppercase tracking-wider text-[var(--data-error)]"
                  >
                    Motivo del rechazo (lo recibe por WhatsApp)
                  </label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ej: La captura no coincide con el monto del plan…"
                    autoFocus
                    className="mt-1.5 h-20 w-full rounded-lg border-2 border-rose-300/60 bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-rose-700/40"
                  />
                  <button
                    disabled={actioning || rejectReason.length < 5}
                    onClick={onReject}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 h-11 px-4 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    {actioning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    )}
                    Confirmar rechazo y notificar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Estado final:{" "}
                <span className="font-bold text-[var(--text-primary)]">
                  {status.label}
                </span>
              </p>
              {proof.status === "approved" && (
                <a
                  href={`/admin?tenant=${proof.tenantSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] h-11 px-3.5 text-xs font-extrabold uppercase tracking-wider text-white transition hover:opacity-90"
                >
                  Ir al panel
                  <ExternalLink
                    className="h-3 w-3"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  accent,
  onCopy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/10"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]",
      )}
    >
      <p className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        {label}
      </p>
      <div className="flex items-center gap-1">
        <p
          className={cn(
            "mt-0.5 truncate font-display font-extrabold flex-1",
            accent
              ? "text-[var(--accent)] text-base"
              : "text-[var(--text-primary)] text-sm",
          )}
        >
          {value}
        </p>
        {onCopy && (
          <button
            onClick={onCopy}
            aria-label={`Copiar ${label}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] shrink-0"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 pointer-events-none"
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
