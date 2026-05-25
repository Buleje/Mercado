"use client";

/**
 * CreateManualGiftCardModal — Emitir gift card manual como admin.
 *
 * Usado para compensaciones a clientes afectados, premios por campaña, etc.
 * El código se genera automáticamente.
 */

import { useState } from "react";
import { Gift, Save, AlertCircle } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";

interface Props {
  onClose: () => void;
  onCreate: (data: {
    amount: number;
    recipientName: string;
    recipientPhone: string;
    message: string;
    expiresAt: string;
    reason: string;
  }) => Promise<void>;
}

export function CreateManualGiftCardModal({ onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    amount: 50,
    recipientName: "",
    recipientPhone: "",
    message: "",
    expiresAt: "",
    reason: "compensacion",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipientName.trim()) {
      setError("El nombre del destinatario es obligatorio.");
      return;
    }
    if (form.amount <= 0) {
      setError("El monto debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(form);
      onClose();
    } catch {
      setError("Error al emitir la gift card. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  // Set default expiry to 1 year from now
  const defaultExpiry = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  })();

  return (
    <AdminModal open onClose={onClose} title="Emitir gift card manual">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
              <Gift className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Gift card manual</span>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info-500)] rounded-xl text-xs text-[var(--data-info-500)]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              La gift card se genera con un código único y queda asociada a este admin.
              El evento se registra en el audit log.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Motivo *</label>
            <select
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white dark:bg-[var(--color-card)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            >
              <option value="compensacion">Compensación por incidencia</option>
              <option value="premio">Premio de campaña</option>
              <option value="prueba">Cortesía por producto defectuoso</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Monto (S/) *</label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Destinatario *</label>
            <input
              type="text"
              value={form.recipientName}
              onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
              placeholder="Nombre completo"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Teléfono</label>
            <input
              type="tel"
              value={form.recipientPhone}
              onChange={(e) => setForm((p) => ({ ...p, recipientPhone: e.target.value }))}
              placeholder="987654321"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Dedicatoria (opcional)</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
              rows={2}
              placeholder="Mensaje para el destinatario"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Vence el</label>
            <input
              type="date"
              value={form.expiresAt || defaultExpiry}
              onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Emitiendo..." : "Emitir gift card"}
            </button>
          </div>
        </form>
    </AdminModal>
  );
}
