"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);

  const [approvedKey, setApprovedKey] = useState<{
    supplierId: string;
    name: string;
    apiKey: string;
  } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string, name: string) => {
    if (!confirm(`¿Aprobar a "${name}"? Se generará un API key único.`))
      return;
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/superadmin/marketplace/suppliers/${id}/approve`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      if (data.apiKey) {
        setApprovedKey({ supplierId: id, name, apiKey: data.apiKey });
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    if (rejectReason.trim().length < 5) {
      alert("La razón debe tener al menos 5 caracteres.");
      return;
    }
    setBusyId(rejectingId);
    try {
      const res = await fetch(
        `/api/superadmin/marketplace/suppliers/${rejectingId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al rechazar");
    } finally {
      setBusyId(null);
    }
  };

  const badgeFor = (id: Tab): number => {
    if (id === "pending_review") return counts.pending;
    if (id === "approved") return counts.approved;
    return counts.rejected;
  };

  const columns = useMemo(() => {
    if (tab === "rejected") {
      return ["RUC", "Razón social", "Categoría", "Contacto", "Rechazado", "Motivo"];
    }
    if (tab === "approved") {
      return ["RUC", "Razón social", "Categoría", "Contacto", "Aprobado", "Por"];
    }
    return ["RUC", "Razón social", "Categoría", "Contacto", "Solicitado", "Acciones"];
  }, [tab]);

  return (
    <div className="space-y-4">
      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                "px-4 py-2 rounded-lg text-sm font-semibold transition " +
                (active
                  ? "bg-white dark:bg-gray-900 text-emerald-600 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white")
              }
            >
              {t.label}{" "}
              <span
                className={
                  "ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold " +
                  (active
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300")
                }
              >
                {badgeFor(t.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando…
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 text-xs text-emerald-600 hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Sin solicitudes en esta bandeja.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-3 text-left whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {r.ruc ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {r.razonSocial ?? r.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                        {r.category ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        {r.contactName ?? "—"}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {r.contactPhone ?? ""}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {r.contactEmail ?? ""}
                      </div>
                    </td>

                    {tab === "pending_review" && (
                      <>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(r.appliedAt ?? r.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleApprove(r.id, r.razonSocial ?? r.name)
                              }
                              disabled={busyId === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                              {busyId === r.id ? "…" : "Aprobar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReject(r.id)}
                              disabled={busyId === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          </div>
                        </td>
                      </>
                    )}

                    {tab === "approved" && (
                      <>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(r.approvedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {r.approvedBy ?? "—"}
                        </td>
                      </>
                    )}

                    {tab === "rejected" && (
                      <>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(r.rejectedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[240px]">
                          {r.rejectionReason ?? "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: API key shown once ──────────────────────────────── */}
      {approvedKey && (
        <Modal onClose={() => setApprovedKey(null)} title="Proveedor aprobado">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            <strong>{approvedKey.name}</strong> fue aprobado y recibirá un
            mensaje por WhatsApp. Esta es su API key — cópiala ahora porque{" "}
            <span className="font-bold text-red-500">
              no se volverá a mostrar
            </span>
            .
          </p>
          <div className="rounded-lg bg-gray-900 dark:bg-black border border-gray-700 p-3 font-mono text-xs text-emerald-400 break-all">
            {approvedKey.apiKey}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(approvedKey.apiKey)
                  .then(() => alert("Copiado"))
                  .catch(() => alert("No se pudo copiar"));
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Copiar API key
            </button>
            <button
              type="button"
              onClick={() => setApprovedKey(null)}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
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
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            La razón se enviará al proveedor por WhatsApp.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Ej: No podemos verificar la información del RUC. Por favor contáctanos."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectingId(null);
                setRejectReason("");
              }}
              disabled={!!busyId}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={!!busyId || rejectReason.trim().length < 5}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {busyId ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
