"use client";

import { MessageCircle, Sparkles, Gift, Home } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface CheckoutNotesFieldProps {
  notes: string;
  onNotesChange: (v: string) => void;
  rows?: number;
}

const QUICK_NOTES: ReadonlyArray<{
  label: string;
  text: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { label: "Cumpleaños", text: "Feliz cumpleaños! ", icon: Sparkles },
  { label: "Regalo", text: "Es un regalo. ", icon: Gift },
  { label: "Portería", text: "Dejar en porteria. ", icon: Home },
];

/**
 * CheckoutNotesField — textarea para mensaje especial del pedido
 * con chips rápidos para insertar templates comunes.
 *
 * Rediseño 2026-05-05: label con icono brand, chips con icono propio,
 * textarea con tokens del DS (sin gray-200 hardcoded).
 */
export function CheckoutNotesField({
  notes,
  onNotesChange,
  rows = 2,
}: CheckoutNotesFieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <MessageCircle
          className="h-4 w-4"
          strokeWidth={2}
          style={{ color: "var(--color-primary, #00A0A0)" }}
        />
        Mensaje especial
        <span className="text-xs text-muted font-medium">(opcional)</span>
      </label>
      <textarea
        value={notes}
        onChange={(e) => {
          if (e.target.value.length <= 200) onNotesChange(e.target.value);
        }}
        rows={rows}
        placeholder="Ej: Feliz cumpleaños María, dejar en portería..."
        className="w-full rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-muted/60 px-4 py-3 text-sm focus:border-[var(--color-primary,#00A0A0)] focus:outline-none transition-colors resize-none"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                const next = (notes + q.text).slice(0, 200);
                onNotesChange(next);
              }}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-full border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--color-primary,#00A0A0)]/40 hover:text-[var(--color-primary,#00A0A0)] transition-colors"
            >
              <q.icon
                className="h-3.5 w-3.5"
                strokeWidth={2.25}
              />
              {q.label}
            </button>
          ))}
        </div>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums shrink-0",
            notes.length > 180
              ? "text-[var(--data-warning-600)]"
              : "text-muted",
          )}
        >
          {notes.length}/200
        </span>
      </div>
    </div>
  );
}
