"use client";

/**
 * PagosYapeClient — revisión de pagos Yape de pedidos (cross-tenant).
 *
 * Un worker de vision IA extrae: monto, código de operación, últimos 4
 * dígitos del destino y fecha desde la captura del cliente. El superadmin
 * ve la imagen grande + tabla de comparación esperado vs detectado, y
 * aprueba o rechaza con motivo.
 *
 * Layout:
 *   - Mobile: lista → detalle stacked (col única)
 *   - Desktop (lg+): 2 columnas — lista (col-4) | detalle (col-8)
 *
 * Auto-refresh cada 30s. Optimistic UI: remueve de la lista al aprobar/
 * rechazar; revierte si el endpoint falla.
 */

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useReducer,
} from "react";
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
} from "@buleje/design-system/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentApproval {
  id: string;
  conversationId: string | null;
  customerPhone: string;
  expectedAmount: number;
  detectedAmount: number | null;
  imageUrl: string;
  /** JSON devuelto por Claude Vision (serializado) */
  visionResponse: Record<string, unknown> | null;
  yapeOpCode: string | null;
  yapeLast4: string | null;
  /** ISO string — el campo en DB es TIMESTAMP pero viene serializado */
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/** Oculta el número: +51 *** **78 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last2 = digits.slice(-2);
  return `+51 *** **${last2}`;
}

/** Tiempo relativo sencillo en español */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

/**
 * Delta entre expected y detected.
 * returns: "exact" | "near" | "far" | "unknown"
 */
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

/**
 * Extrae la confianza de la extracción de vision desde visionResponse.
 * El campo puede venir como { confidence: 0.92 } o similar.
 */
function getConfidence(visionResponse: Record<string, unknown> | null): number | null {
  if (!visionResponse) return null;
  const c = visionResponse.confidence;
  if (typeof c === "number") return c;
  return null;
}

const DELTA_CLASS: Record<string, string> = {
  exact: "text-[var(--data-success-500)] font-extrabold",
  near:  "text-[var(--data-warning-500)] font-extrabold",
  far:   "text-[var(--data-error-500)] font-extrabold",
  unknown: "text-[var(--text-tertiary)]",
};

const DELTA_ICON: Record<string, React.ReactNode> = {
  exact:   <CheckCircle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  near:    <AlertTriangle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  far:     <XCircle className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
  unknown: <Clock className="w-3.5 h-3.5 inline-block mr-0.5 shrink-0" />,
};

// ─── Optimistic reducer ───────────────────────────────────────────────────────

type Action =
  | { type: "set"; payload: PaymentApproval[] }
  | { type: "remove"; id: string }
  | { type: "revert"; item: PaymentApproval };

function approvalsReducer(
  state: PaymentApproval[],
  action: Action,
): PaymentApproval[] {
  switch (action.type) {
    case "set":    return action.payload;
    case "remove": return state.filter((a) => a.id !== action.id);
    case "revert": return [action.item, ...state.filter((a) => a.id !== action.item.id)];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PagosYapeClient({ initialCount }: Props) {
  const [approvals, dispatch] = useReducer(approvalsReducer, []);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentApproval | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  // Reject modal state
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  // Fullscreen image dialog
  const [zoomOpen, setZoomOpen] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/superadmin/payment-approvals?status=pending",
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        setError("No se pudieron cargar los pagos.");
        return;
      }
      const data = (await res.json()) as { approvals: PaymentApproval[]; total: number };
      dispatch({ type: "set", payload: data.approvals ?? [] });
    } catch {
      setError("Error de red.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => { void load(); }, [load]);

  // Polling 30s
  useEffect(() => {
    pollingRef.current = setInterval(() => { void load(true); }, 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  // ── Approve ──────────────────────────────────────────────────────────────

  const approve = async (approval: PaymentApproval) => {
    setActioning(approval.id);
    // Optimistic: remove instantly
    dispatch({ type: "remove", id: approval.id });
    if (selected?.id === approval.id) setSelected(null);

    try {
      const res = await fetch(
        `/api/superadmin/payment-approvals/${approval.id}/approve`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        // Revert
        dispatch({ type: "revert", item: approval });
        setSelected(approval);
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Error al aprobar");
      }
    } catch {
      dispatch({ type: "revert", item: approval });
      setSelected(approval);
      setError("Error de red al aprobar.");
    } finally {
      setActioning(null);
    }
  };

  // ── Reject ───────────────────────────────────────────────────────────────

  const openReject = (id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTargetId) return;
    const result = rejectReason.trim();
    if (result.length < 5) return;

    const approval = approvals.find((a) => a.id === rejectTargetId);
    if (!approval) return;

    setActioning(rejectTargetId);
    setRejectOpen(false);

    // Optimistic: remove instantly
    dispatch({ type: "remove", id: rejectTargetId });
    if (selected?.id === rejectTargetId) setSelected(null);

    try {
      const res = await fetch(
        `/api/superadmin/payment-approvals/${rejectTargetId}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: result }),
        },
      );
      if (!res.ok) {
        dispatch({ type: "revert", item: approval });
        setSelected(approval);
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Error al rechazar");
      }
    } catch {
      dispatch({ type: "revert", item: approval });
      setSelected(approval);
      setError("Error de red al rechazar.");
    } finally {
      setActioning(null);
      setRejectTargetId(null);
    }
  };

  // ── Render: empty state ──────────────────────────────────────────────────

  const isEmpty = !loading && approvals.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-500)]"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 hover:opacity-70"
            aria-label="Cerrar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {loading
            ? "Cargando..."
            : `${approvals.length} pendiente${approvals.length !== 1 ? "s" : ""}`}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            strokeWidth={2.25}
          />
          Refrescar
        </button>
      </div>

      {/* Loading spinner (first load) */}
      {loading && approvals.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[var(--rule-base)] py-20 text-center px-6">
          {/* Paiche SVG inline — ilustración mínima */}
          <svg
            width="80"
            height="60"
            viewBox="0 0 80 60"
            fill="none"
            aria-hidden="true"
            className="opacity-30"
          >
            <ellipse cx="38" cy="38" rx="28" ry="16" fill="var(--accent)" fillOpacity="0.4" />
            <ellipse cx="38" cy="34" rx="20" ry="12" fill="var(--accent)" fillOpacity="0.6" />
            <circle cx="48" cy="31" r="2" fill="var(--text-primary)" fillOpacity="0.5" />
            <path d="M10 38 Q4 30 10 22" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
          <div>
            <p className="text-base font-bold text-[var(--text-secondary)]">
              Todo al dia. Sin pagos pendientes.
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              Los pagos Yape aparecen aqui cuando un cliente sube su captura.
            </p>
          </div>
        </div>
      )}

      {/* 2-col layout */}
      {!isEmpty && approvals.length > 0 && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4">

          {/* ── Lista (col-4) ─────────────────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto pr-1">
            {approvals.map((a) => {
              const delta = deltaStatus(a.expectedAmount, a.detectedAmount);
              const isSelected = selected?.id === a.id;
              const isBusy = actioning === a.id;

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a)}
                  disabled={isBusy}
                  className={[
                    "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                    "hover:border-[var(--accent)]/50 hover:shadow-md",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-md"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
                    isBusy ? "opacity-40 pointer-events-none" : "",
                  ].join(" ")}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Phone masked */}
                    <span
                      className="text-xs font-bold text-[var(--text-secondary)] font-mono"
                      data-no-translate
                    >
                      {maskPhone(a.customerPhone)}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                      {relativeTime(a.createdAt)}
                    </span>
                  </div>

                  {/* Amounts row */}
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

                  {/* review_required badge */}
                  {a.status === "review_required" && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-[10px] font-extrabold text-[var(--data-warning-500)]">
                      <AlertTriangle className="w-3 h-3" />
                      Revision requerida
                    </div>
                  )}

                  {/* Confidence badge if low (from visionResponse) */}
                  {(() => {
                    const conf = getConfidence(a.visionResponse);
                    if (conf != null && conf < 0.7) {
                      return (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-500)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--data-warning-500)]">
                          <AlertTriangle className="w-3 h-3" />
                          IA {Math.round(conf * 100)}% confianza
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Op code */}
                  {a.yapeOpCode && (
                    <p
                      className="mt-1 text-[10px] font-mono text-[var(--text-tertiary)]"
                      data-no-translate
                    >
                      Op. {a.yapeOpCode}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Detalle (col-8) ───────────────────────────────────────────── */}
          <div className="lg:col-span-8">
            {!selected ? (
              <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-sm text-[var(--text-tertiary)]">
                Seleccioná un pago para revisar
              </div>
            ) : (
              <DetailPanel
                approval={selected}
                actioning={actioning === selected.id}
                onApprove={() => void approve(selected)}
                onRejectOpen={() => openReject(selected.id)}
                onZoom={() => setZoomOpen(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Reject modal ──────────────────────────────────────────────────── */}
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
            className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-6 shadow-[var(--shadow-xl)]"
          >
            <h2
              id="reject-dialog-title"
              className="text-lg font-bold text-[var(--text-primary)] mb-1"
            >
              Rechazar pago
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              El cliente recibirá este motivo por WhatsApp.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: El monto no coincide con el pedido. Por favor, sube la captura correcta."
              rows={4}
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
                className="flex-1 h-11 rounded-xl border-2 border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmReject()}
                disabled={rejectReason.trim().length < 5 || actioning != null}
                className="flex-1 h-11 rounded-xl bg-[var(--data-error-500)] text-white text-sm font-extrabold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom modal ────────────────────────────────────────────────────── */}
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
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Cerrar imagen ampliada"
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
    </>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  approval: PaymentApproval;
  actioning: boolean;
  onApprove: () => void;
  onRejectOpen: () => void;
  onZoom: () => void;
}

function DetailPanel({
  approval,
  actioning,
  onApprove,
  onRejectOpen,
  onZoom,
}: DetailPanelProps) {
  const delta = deltaStatus(approval.expectedAmount, approval.detectedAmount);

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
        {/* Zoom button */}
        <button
          type="button"
          onClick={onZoom}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-black/60 text-white text-xs font-semibold hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Ampliar imagen"
        >
          <ZoomIn className="w-3.5 h-3.5" />
          Ampliar
        </button>
      </div>

      {/* Data table + actions */}
      <div className="p-5">
        {/* Comparison table */}
        <h3 className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Datos extraídos por IA
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <th className="text-left px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Campo
                </th>
                <th className="text-left px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Esperado
                </th>
                <th className="text-left px-4 py-2 text-xs font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Detectado por IA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-base)]">
              {/* Monto */}
              <tr>
                <td className="px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Monto
                </td>
                <td
                  className="px-4 py-2.5 font-bold tabular-nums text-[var(--text-primary)]"
                  data-no-translate
                >
                  {new Intl.NumberFormat("es-PE", {
                    style: "currency",
                    currency: "PEN",
                  }).format(approval.expectedAmount)}
                </td>
                <td
                  className={`px-4 py-2.5 tabular-nums ${DELTA_CLASS[delta]}`}
                  data-no-translate
                >
                  {approval.detectedAmount != null ? (
                    <>
                      {DELTA_ICON[delta]}
                      {new Intl.NumberFormat("es-PE", {
                        style: "currency",
                        currency: "PEN",
                      }).format(approval.detectedAmount)}
                    </>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              {/* Fecha */}
              <tr>
                <td className="px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Fecha operación
                </td>
                <td className="px-4 py-2.5 text-[var(--text-tertiary)]">
                  {relativeTime(approval.createdAt)}
                </td>
                <td
                  className="px-4 py-2.5 text-[var(--text-primary)] font-mono text-xs"
                  data-no-translate
                >
                  {approval.yapeDate ?? (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              {/* Código operación */}
              <tr>
                <td className="px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Operación
                </td>
                <td className="px-4 py-2.5 text-[var(--text-tertiary)]">—</td>
                <td
                  className="px-4 py-2.5 font-mono text-xs text-[var(--text-primary)]"
                  data-no-translate
                >
                  {approval.yapeOpCode ?? (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              {/* Últimos 4 destino */}
              <tr>
                <td className="px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                  Últimos 4 destino
                </td>
                <td
                  className="px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]"
                  data-no-translate
                >
                  {/* El número Yape de Buleje — se mostrará si está configurado */}
                  —
                </td>
                <td
                  className="px-4 py-2.5 font-mono text-xs"
                  data-no-translate
                >
                  {approval.yapeLast4 ? (
                    <span className="font-extrabold text-[var(--text-primary)]">
                      {approval.yapeLast4}
                      <CheckCircle className="w-3.5 h-3.5 inline ml-1 text-[var(--data-success-500)]" />
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>

              {/* Confianza IA (extraída de visionResponse) */}
              {(() => {
                const conf = getConfidence(approval.visionResponse);
                if (conf == null) return null;
                const colorClass =
                  conf >= 0.85
                    ? "text-[var(--data-success-500)]"
                    : conf >= 0.7
                      ? "text-[var(--data-warning-500)]"
                      : "text-[var(--data-error-500)]";
                return (
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                      Confianza IA
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-tertiary)]">—</td>
                    <td
                      className={`px-4 py-2.5 font-extrabold ${colorClass}`}
                      data-no-translate
                    >
                      {Math.round(conf * 100)}%
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
          {approval.conversationId && (
            <span data-no-translate>
              Conversacion: <span className="font-mono">{approval.conversationId.slice(0, 12)}…</span>
            </span>
          )}
          {approval.rejectionReason && (
            <span className="text-[var(--data-warning-500)]">
              Razon IA: {approval.rejectionReason}
            </span>
          )}
          <span>
            Recibido: {relativeTime(approval.createdAt)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={actioning}
            className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--data-success-500)] text-white text-sm font-extrabold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
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
            className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--data-error-500)] text-white text-sm font-extrabold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
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
