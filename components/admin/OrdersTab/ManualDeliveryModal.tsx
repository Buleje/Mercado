"use client";

/**
 * ManualDeliveryModal — confirma "Entregado (manual)" pidiendo método.
 *
 * FIX 2026-05-07: cuando el dueño marca un pedido como entregado SIN pasar
 * por delivery (cliente vino al mostrador, entrega propia, etc), pedimos:
 *  1. Método de entrega (4 opciones rápidas + Otro)
 *  2. Nota libre opcional
 *
 * Genera una nota auto-formateada que se persiste en OrderStatusHistory.note
 * para auditoría. Útil para reportes "% entregas sin delivery", "métodos
 * más usados", etc.
 */

import { useState } from "react";
import { Check, Store, User, HeartHandshake, MoreHorizontal, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const METHODS = [
  { id: "mostrador", label: "Cliente recogió en mostrador", icon: Store },
  { id: "propia", label: "Entregué yo mismo", icon: User },
  { id: "encargo", label: "Encargo a alguien", icon: HeartHandshake },
  { id: "otro", label: "Otro", icon: MoreHorizontal },
] as const;

type MethodId = typeof METHODS[number]["id"];

interface ManualDeliveryModalProps {
  open: boolean;
  customerName: string;
  onConfirm: (deliveryReason: string) => void;
  onCancel: () => void;
}

function buildReason(method: MethodId, methodLabel: string, note: string): string {
  // Formato auditable: "Entrega manual · Mostrador · 2026-05-07 14:30 · [nota]"
  const ts = new Date().toLocaleString("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const trimmedNote = note.trim();
  const noteSuffix = trimmedNote ? ` · ${trimmedNote}` : "";
  // method id corto en code-style + label legible primero
  return `Entrega manual · ${methodLabel} · ${ts} · ${method}${noteSuffix}`;
}

export default function ManualDeliveryModal({
  open,
  customerName,
  onConfirm,
  onCancel,
}: ManualDeliveryModalProps) {
  const [method, setMethod] = useState<MethodId>("mostrador");
  const [note, setNote] = useState("");

  if (!open) return null;

  const selectedMethod = METHODS.find((m) => m.id === method) ?? METHODS[0];

  const handleConfirm = () => {
    const reason = buildReason(method, selectedMethod.label, note);
    onConfirm(reason);
    // Reset state for next open
    setMethod("mostrador");
    setNote("");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-delivery-title"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-lg bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <div className="min-w-0">
            <h2
              id="manual-delivery-title"
              className="text-lg font-extrabold text-[var(--text-primary)]"
            >
              Marcar como entregado
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 truncate">
              Pedido de {customerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Método */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              ¿Cómo se entregó?
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Esto queda guardado para tus reportes — sabrás cuántas entregas
              haces sin delivery.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {METHODS.map((m) => {
                const isActive = method === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 h-12 rounded-xl border-2 text-sm font-semibold text-left transition-all",
                      isActive
                        ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--data-success-500)]/40",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nota opcional */}
          <div className="space-y-2">
            <label
              htmlFor="manual-delivery-note"
              className="text-sm font-bold text-[var(--text-primary)] block"
            >
              Nota (opcional)
            </label>
            <textarea
              id="manual-delivery-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Ej: cliente preguntó por descuento, entregué con propina, etc."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none resize-y"
            />
            <p className="text-xs text-[var(--text-tertiary)] text-right font-mono">
              {note.length}/200
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <footer className="flex items-center gap-2 px-5 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-none inline-flex items-center justify-center h-11 px-4 rounded-xl text-sm font-semibold border-2 border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-sm font-extrabold bg-[var(--data-success-500)] text-white hover:opacity-90 shadow-md shadow-[var(--data-success-500)]/30 transition-all active:scale-[0.99]"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            Confirmar entrega
          </button>
        </footer>
      </div>
    </div>
  );
}
