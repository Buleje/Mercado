"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Download,
  Copy,
  KeyRound,
  Inbox,
  AlertTriangle,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

// ─── Types (mirror of lib/db/supplier-signup.db.ts DbSupplierRow) ────────────

type SupplierRow = {
  id: string;
  name: string;
  ruc: string | null;
  razonSocial: string | null;
  category: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
  appliedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

type Counts = { pending: number; approved: number; rejected: number };
type Tab = "pending_review" | "approved" | "rejected";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

const TABS: { id: Tab; label: string }[] = [
  { id: "pending_review", label: "Pendientes" },
  { id: "approved", label: "Aprobados" },
  { id: "rejected", label: "Rechazados" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuppliersQueueClient() {
  const [tab, setTab] = useState<Tab>("pending_review");
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [approvedKey, setApprovedKey] = useState<{
    name: string;
    apiKey: string;
  } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/superadmin/marketplace/suppliers?status=${tab}&limit=200`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as {
        suppliers: SupplierRow[];
        counts: Counts;
      };
      setRows(data.suppliers);
      setCounts(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Keyboard: "/" search · "R" reload · "Esc" close/clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.isContentEditable;
      if (e.key === "Escape") {
        if (approvedKey) return setApprovedKey(null);
        if (confirmApprove) return setConfirmApprove(null);
        if (rejectingId && !busyId) {
          setRejectingId(null);
          setRejectReason("");
          return;
        }
        if (!inField && search) setSearch("");
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [approvedKey, confirmApprove, rejectingId, busyId, search, load]);

  const doApprove = async (id: string, name: string) => {
    setConfirmApprove(null);
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/superadmin/marketplace/suppliers/${id}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({}),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      if (data.apiKey) setApprovedKey({ name, apiKey: data.apiKey });
      pushToast(`"${name}" aprobado`, "success");
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Error al aprobar", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    if (rejectReason.trim().length < 5) {
      pushToast("La razón debe tener al menos 5 caracteres", "error");
      return;
    }
    setBusyId(rejectingId);
    try {
      const res = await fetch(
        `/api/superadmin/marketplace/suppliers/${rejectingId}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ reason: rejectReason.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setRejectingId(null);
      setRejectReason("");
      pushToast("Solicitud rechazada", "success");
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Error al rechazar", "error");
    } finally {
      setBusyId(null);
    }
  };

  const copyKey = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        pushToast("API key copiada", "success");
      } catch {
        pushToast("No se pudo copiar", "error");
      }
    },
    [pushToast],
  );

  const badgeFor = (id: Tab): number =>
    id === "pending_review"
      ? counts.pending
      : id === "approved"
        ? counts.approved
        : counts.rejected;

  // Filtro de búsqueda client-side (razón social / RUC / contacto / categoría)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.razonSocial, r.name, r.ruc, r.contactName, r.contactEmail, r.category]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const exportCsv = useCallback(() => {
    const headers = [
      "RUC",
      "Razón social",
      "Nombre",
      "Categoría",
      "Contacto",
      "Teléfono",
      "Email",
      "Estado",
      "Solicitado",
      "Resuelto",
      "Motivo rechazo",
    ];
    const lines = filtered.map((r) =>
      [
        r.ruc ?? "",
        r.razonSocial ?? "",
        r.name,
        r.category ?? "",
        r.contactName ?? "",
        r.contactPhone ?? "",
        r.contactEmail ?? "",
        r.status,
        r.appliedAt ?? r.createdAt,
        r.approvedAt ?? r.rejectedAt ?? "",
        r.rejectionReason ?? "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [headers.join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proveedores-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`${filtered.length} filas exportadas`, "success");
  }, [filtered, tab, pushToast]);

  const isFiltered = search.trim().length > 0;

  return (
    <div className="space-y-4">
      <Toasts toasts={toasts} />

      {/* ── Toolbar: tabs + search + acciones ──────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 w-fit">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-4 py-2.5 rounded-lg text-sm font-semibold transition min-h-[44px]",
                  active
                    ? "bg-[var(--surface-raised)] text-emerald-700 dark:text-emerald-300 shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {t.label}{" "}
                <span
                  className={cn(
                    "ml-1 inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full text-xs font-bold",
                    active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-gray-200 dark:bg-gray-700 text-[var(--text-secondary)]",
                  )}
                >
                  {badgeFor(t.id)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar  ( / )"
              className="h-12 w-full sm:w-64 pl-9 pr-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            title="Recargar (R)"
            className="inline-flex items-center justify-center h-12 w-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Exportar CSV"
            className="inline-flex items-center gap-2 h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* ── Contenido ──────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-10 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-rose-600 dark:text-rose-400 mb-2" />
          <p className="text-base font-bold text-rose-700 dark:text-rose-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isFiltered={isFiltered} onClear={() => setSearch("")} />
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden sm:block rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-base">
                <thead className="bg-[var(--surface-sunken)]/50 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left whitespace-nowrap">RUC</th>
                    <th className="px-4 py-3 text-left">Razón social</th>
                    <th className="px-4 py-3 text-left">Categoría</th>
                    <th className="px-4 py-3 text-left">Contacto</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">
                      {tab === "approved"
                        ? "Aprobado"
                        : tab === "rejected"
                          ? "Rechazado"
                          : "Solicitado"}
                    </th>
                    <th className="px-4 py-3 text-left">
                      {tab === "pending_review"
                        ? "Acciones"
                        : tab === "approved"
                          ? "Por"
                          : "Motivo"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--surface-sunken)]/30">
                      <td className="px-4 py-3 font-mono text-sm text-[var(--text-secondary)]">
                        {r.ruc ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">
                        {r.razonSocial ?? r.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)] capitalize">
                          {r.category ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-[var(--text-secondary)] font-medium">
                          {r.contactName ?? "—"}
                        </div>
                        <div className="text-[var(--text-tertiary)]">
                          {r.contactPhone ?? ""}
                        </div>
                        <div className="text-[var(--text-tertiary)]">
                          {r.contactEmail ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-tertiary)] whitespace-nowrap">
                        {formatDate(
                          tab === "approved"
                            ? r.approvedAt
                            : tab === "rejected"
                              ? r.rejectedAt
                              : (r.appliedAt ?? r.createdAt),
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tab === "pending_review" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmApprove({
                                  id: r.id,
                                  name: r.razonSocial ?? r.name,
                                })
                              }
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {busyId === r.id ? "…" : "Aprobar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(r.id);
                                setRejectReason("");
                              }}
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl text-sm font-bold border-2 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                            >
                              <XCircle className="h-4 w-4" /> Rechazar
                            </button>
                          </div>
                        ) : tab === "approved" ? (
                          <span className="text-sm text-[var(--text-tertiary)]">
                            {r.approvedBy ?? "—"}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--text-tertiary)] block max-w-[240px]">
                            {r.rejectionReason ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-[var(--text-primary)]">
                      {r.razonSocial ?? r.name}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-tertiary)]">
                      RUC {r.ruc ?? "—"}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)] capitalize shrink-0">
                    {r.category ?? "—"}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  {r.contactName ?? "—"}
                  {r.contactPhone ? ` · ${r.contactPhone}` : ""}
                </div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {formatDate(
                    tab === "approved"
                      ? r.approvedAt
                      : tab === "rejected"
                        ? r.rejectedAt
                        : (r.appliedAt ?? r.createdAt),
                  )}
                </div>
                {tab === "rejected" && r.rejectionReason && (
                  <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                    {r.rejectionReason}
                  </p>
                )}
                {tab === "pending_review" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmApprove({
                          id: r.id,
                          name: r.razonSocial ?? r.name,
                        })
                      }
                      disabled={busyId === r.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(r.id);
                        setRejectReason("");
                      }}
                      disabled={busyId === r.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-bold border-2 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Confirm approve ────────────────────────────────────────── */}
      {confirmApprove && (
        <Modal onClose={() => setConfirmApprove(null)} title="Aprobar proveedor">
          <p className="text-base text-[var(--text-secondary)] mb-4">
            Se generará una API key única para{" "}
            <strong className="text-[var(--text-primary)]">
              {confirmApprove.name}
            </strong>
            . La verás una sola vez en pantalla.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmApprove(null)}
              className="h-11 px-4 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-800 text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => doApprove(confirmApprove.id, confirmApprove.name)}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" /> Aprobar y generar key
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: API key shown once ──────────────────────────────── */}
      {approvedKey && (
        <Modal onClose={() => setApprovedKey(null)} title="Proveedor aprobado">
          <p className="text-base text-[var(--text-secondary)] mb-3">
            <strong className="text-[var(--text-primary)]">
              {approvedKey.name}
            </strong>{" "}
            fue aprobado. Por WhatsApp solo recibe el aviso —{" "}
            <span className="font-bold text-rose-700 dark:text-rose-300">
              la API key NO se envía por ese canal
            </span>
            . Copiala ahora y entregásela por un canal seguro: no se volverá a
            mostrar.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-black border-2 border-slate-700 p-3 font-mono text-sm text-emerald-400 break-all">
            <KeyRound className="h-4 w-4 shrink-0 text-emerald-500" />
            {approvedKey.apiKey}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void copyKey(approvedKey.apiKey)}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Copy className="h-4 w-4" /> Copiar API key
            </button>
            <button
              type="button"
              onClick={() => setApprovedKey(null)}
              className="h-11 px-4 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-800 text-[var(--text-secondary)]"
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: reject reason ────────────────────────────────────── */}
      {rejectingId && (
        <Modal
          onClose={() => {
            if (busyId) return;
            setRejectingId(null);
            setRejectReason("");
          }}
          title="Rechazar solicitud"
        >
          <p className="text-base text-[var(--text-secondary)] mb-2">
            La razón se enviará al proveedor por WhatsApp.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Ej: No podemos verificar la información del RUC. Por favor contáctanos."
            className="w-full px-3 py-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectingId(null);
                setRejectReason("");
              }}
              disabled={!!busyId}
              className="h-11 px-4 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-800 text-[var(--text-secondary)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={!!busyId || rejectReason.trim().length < 5}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              {busyId ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function SkeletonRows() {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-4 border-b border-[var(--rule-base)] last:border-0 animate-pulse"
        >
          <div className="h-4 w-24 rounded bg-[var(--surface-sunken)]" />
          <div className="h-4 flex-1 rounded bg-[var(--surface-sunken)]" />
          <div className="h-4 w-20 rounded bg-[var(--surface-sunken)]" />
          <div className="h-9 w-32 rounded-xl bg-[var(--surface-sunken)]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  isFiltered,
  onClear,
}: {
  isFiltered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
      <Inbox className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
      <p className="text-base font-bold text-[var(--text-primary)]">
        {isFiltered ? "Sin coincidencias" : "Sin solicitudes en esta bandeja"}
      </p>
      <p className="text-sm text-[var(--text-tertiary)] mt-1">
        {isFiltered
          ? "Ajustá la búsqueda."
          : "Cuando lleguen solicitudes de proveedores, aparecerán aquí."}
      </p>
      {isFiltered && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 h-11 px-4 rounded-xl text-sm font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-xl)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-5 w-5 text-[var(--text-secondary)]" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
}
