"use client";

/**
 * ScheduleLiveModal — Programar una transmisión en vivo futura.
 *
 * Título, descripción, fecha y hora. Los productos a destacar se agregan después,
 * con la transmisión ya programada (el pedido de programar no los recibe).
 */

import { useState } from "react";
import { Save, AlertCircle } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";

export interface ScheduledLiveData {
  title: string;
  description: string;
  scheduledAt: string;
}

interface Props {
  onClose: () => void;
  /** `false` = no se pudo guardar: la ventana se queda abierta con lo escrito. */
  onSchedule: (data: ScheduledLiveData) => Promise<boolean>;
}

export function ScheduleLiveModal({ onClose, onSchedule }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (!date || !time) {
      setError("Fecha y hora son obligatorias.");
      return;
    }
    const scheduledAt = `${date}T${time}:00`;
    if (new Date(scheduledAt) <= new Date()) {
      setError("La fecha debe ser futura.");
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSchedule({ title: title.trim(), description: description.trim(), scheduledAt });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Programar transmisión"
      variant="default"
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5 sm:px-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <Field label="Título *" labelClassName="text-sm font-bold text-[var(--text-secondary)]" className="space-y-1.5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Ofertas de fin de semana"
            className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            autoFocus
          />
        </Field>

        <Field label="Descripción" labelClassName="text-sm font-bold text-[var(--text-secondary)]" className="space-y-1.5">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Describe qué verán los espectadores"
            className="w-full px-3 min-h-12 rounded-xl border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha *" labelClassName="text-sm font-bold text-[var(--text-secondary)]" className="space-y-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Hora *" labelClassName="text-sm font-bold text-[var(--text-secondary)]" className="space-y-1.5">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-12 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 inline-flex disabled:opacity-60 items-center justify-center gap-2 min-h-12 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Programando…" : "Programar"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
