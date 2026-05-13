"use client";

/**
 * PaymentProofViewer
 *
 * Bloque visual reutilizable para mostrar el comprobante de pago de una
 * Order. Lazy-fetch a GET /api/admin/orders/[id]/payment-proof al montar.
 *
 * Usado por:
 *   - components/admin/OrdersTab/OrdersDetailPanel.tsx (tab=pedidos)
 *   - components/admin/unified/marketplace/OrderDetailDrawer.tsx (tab=marketplace)
 *   - components/superadmin/orders/... (modal superadmin)
 *
 * UX:
 *   - Loader mientras hace fetch
 *   - "Sin comprobante" si la Order es efectivo o no tiene PaymentApproval
 *   - Imagen clickable (abre fullscreen) + metadata (método, monto, fecha)
 *   - Badge de status (pending / approved / rejected)
 */

import { useEffect, useState } from "react";
import {
  X,
  ZoomIn,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Method = "yape" | "plin" | "transfer" | "efectivo" | string | null;

interface PaymentProof {
  id: string;
  imageUrl: string;
  status: "pending" | "review_required" | "approved" | "rejected" | string;
  method: Method;
  expectedAmount: number;
  detectedAmount: number | null;
  opCode: string | null;
  last4: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface Props {
  orderId: string;
  /** Si la Order ya sabe que es efectivo, evita el fetch */
  isCash?: boolean;
  className?: string;
}

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
  efectivo: "Efectivo",
};

const STATUS_BADGE: Record<
  string,
  { label: string; bg: string; text: string; Icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "Pendiente revisión",
    bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300/40",
    text: "amber",
    Icon: Clock,
  },
  review_required: {
    label: "Requiere revisión",
    bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300/40",
    text: "amber",
    Icon: AlertCircle,
  },
  approved: {
    label: "Aprobado",
    bg: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300/40",
    text: "emerald",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Rechazado",
    bg: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300/40",
    text: "red",
    Icon: AlertCircle,
  },
};

function fmtPEN(n: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PaymentProofViewer({ orderId, isCash, className }: Props) {
  const [proof, setProof] = useState<PaymentProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (isCash) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payment-proof`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { proof: PaymentProof | null }) => {
        if (!cancelled) setProof(data.proof);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar el comprobante");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, isCash]);

  if (isCash) return null;
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-tertiary)]",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando comprobante…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-tertiary)]",
          className,
        )}
      >
        <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
        {error}
      </div>
    );
  }
  if (!proof) {
    return null;
  }

  const badge = STATUS_BADGE[proof.status] ?? STATUS_BADGE.pending;
  const BadgeIcon = badge.Icon;
  const methodLabel = proof.method
    ? METHOD_LABEL[proof.method] ?? proof.method
    : "Pago manual";

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Comprobante
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {methodLabel}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold border",
              badge.bg,
            )}
          >
            <BadgeIcon className="h-3 w-3" strokeWidth={2.5} />
            {badge.label}
          </span>
        </div>

        <div className="grid grid-cols-[140px_1fr] gap-3 p-4">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="group relative aspect-[3/4] rounded-xl overflow-hidden border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[var(--accent)] transition-colors"
            aria-label="Ampliar comprobante"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proof.imageUrl}
              alt="Comprobante de pago"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ZoomIn className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
          </button>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-tertiary)] font-semibold">
                Monto esperado
              </dt>
              <dd className="font-bold text-[var(--text-primary)] tabular-nums">
                {fmtPEN(proof.expectedAmount)}
              </dd>
            </div>
            {proof.detectedAmount !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)] font-semibold">
                  Monto detectado
                </dt>
                <dd
                  className={cn(
                    "font-bold tabular-nums",
                    Math.abs(proof.detectedAmount - proof.expectedAmount) < 0.01
                      ? "text-[var(--data-success-500)]"
                      : "text-[var(--data-error-500)]",
                  )}
                >
                  {fmtPEN(proof.detectedAmount)}
                </dd>
              </div>
            )}
            {proof.opCode && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)] font-semibold">
                  N° operación
                </dt>
                <dd className="font-mono font-semibold text-[var(--text-primary)] truncate">
                  {proof.opCode}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-tertiary)] font-semibold">
                Subido
              </dt>
              <dd className="text-[var(--text-secondary)]">
                {fmtDate(proof.createdAt)}
              </dd>
            </div>
            {proof.reviewedBy && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)] font-semibold">
                  Revisado por
                </dt>
                <dd className="text-[var(--text-secondary)]">
                  {proof.reviewedBy} · {fmtDate(proof.reviewedAt)}
                </dd>
              </div>
            )}
            {proof.rejectionReason && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-2">
                <p className="text-xs text-red-700 dark:text-red-300">
                  <span className="font-bold">Rechazo:</span>{" "}
                  {proof.rejectionReason}
                </p>
              </div>
            )}
            <a
              href={proof.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir en pestaña nueva
            </a>
          </dl>
        </div>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprobante ampliado"
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute top-4 right-4 inline-flex items-center justify-center h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
            }}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proof.imageUrl}
            alt="Comprobante de pago ampliado"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
