"use client";

/**
 * GiftCardDetailsModal — Panel detalle de gift card.
 *
 * Muestra toda la info, historial de uso, y permite cancelar/extender.
 */

import { Calendar, User, Gift, Copy, CheckCircle } from "@buleje/design-system/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";

export interface GiftCardDetails {
  id: string;
  code: string;
  amount: number;
  balance: number;
  recipientName: string;
  recipientPhone?: string;
  senderName?: string;
  message: string;
  status: "pendiente" | "canjeada" | "expirada" | "cancelada";
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
  redeemedBy?: string;
}

const STATUS_LABELS: Record<GiftCardDetails["status"], string> = {
  pendiente: "Pendiente",
  canjeada: "Canjeada",
  expirada: "Expirada",
  cancelada: "Cancelada",
};

const STATUS_STYLES: Record<GiftCardDetails["status"], string> = {
  pendiente: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  canjeada: "bg-[var(--data-info-100)] text-[var(--data-info-500)]",
  expirada: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  cancelada: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

interface Props {
  card: GiftCardDetails;
  onClose: () => void;
  onCancel: (id: string) => void;
  onExtend: (id: string, newExpiry: string) => void;
}

export function GiftCardDetailsModal({ card, onClose, onCancel, onExtend }: Props) {
  const [copied, setCopied] = useState(false);
  const [extending, setExtending] = useState(false);
  const [newExpiry, setNewExpiry] = useState("");

  const copyCode = () => {
    navigator.clipboard.writeText(card.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExtend = () => {
    if (!newExpiry) return;
    onExtend(card.id, newExpiry);
    setExtending(false);
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Gift Card"
      description="Detalles de la tarjeta regalo"
    >
        {/* Body */}
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Tarjeta regalo</p>
          </div>
          {/* Código */}
          <div className="bg-linear-to-br from-gray-50 to-gray-100 rounded-xl p-4">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Código</p>
            <div className="flex items-center gap-3">
              <p className="font-mono text-2xl font-extrabold text-[var(--text-primary)] tracking-wider">
                {card.code}
              </p>
              <button
                onClick={copyCode}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
                title="Copiar código"
              >
                {copied ? <CheckCircle className="h-4 w-4 text-[var(--data-success-500)]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Monto y estado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Monto inicial</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1">{fmt(card.amount)}</p>
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Saldo disponible</p>
              <p className="text-xl font-extrabold text-primary mt-1">{fmt(card.balance)}</p>
            </div>
          </div>

          {/* Estado */}
          <div className="flex items-center justify-between p-3 bg-[var(--surface-alt)] rounded-xl">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Estado</span>
            <span className={cn("inline-flex px-3 py-1 rounded-full text-xs font-bold", STATUS_STYLES[card.status])}>
              {STATUS_LABELS[card.status]}
            </span>
          </div>

          {/* Destinatario */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Destinatario</p>
            <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)] text-sm">{card.recipientName}</p>
                  {card.recipientPhone && (
                    <p className="text-xs text-[var(--text-secondary)]">{card.recipientPhone}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mensaje */}
          {card.message && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Dedicatoria</p>
              <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-3">
                <p className="text-sm text-[var(--text-primary)] italic">&ldquo;{card.message}&rdquo;</p>
                {card.senderName && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2">— {card.senderName}</p>
                )}
              </div>
            </div>
          )}

          {/* Fechas */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Cronología</p>
            <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-xl divide-y divide-gray-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Emitida
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(card.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Vence
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(card.expiresAt)}</span>
              </div>
              {card.redeemedAt && (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Canjeada
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(card.redeemedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Extend form */}
          {extending && (
            <div className="space-y-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info-500)] rounded-xl">
              <Field label="Nueva fecha de vencimiento" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
                <input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </Field>
              <div className="flex gap-2">
                <button
                  onClick={() => setExtending(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExtend}
                  disabled={!newExpiry}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50"
                >
                  Extender
                </button>
              </div>
            </div>
          )}

          {/* Acciones */}
          {card.status === "pendiente" && !extending && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setExtending(true)}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors"
              >
                Extender vencimiento
              </button>
              <button
                onClick={() => onCancel(card.id)}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-[var(--data-error-500)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] transition-colors"
              >
                Cancelar y reembolsar
              </button>
            </div>
          )}
        </div>
    </AdminModal>
  );
}
