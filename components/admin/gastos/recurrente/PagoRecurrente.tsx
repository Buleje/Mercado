"use client";

import { Wallet, CreditCard, Banknote, Smartphone, Clock, StickyNote, Bell, Hash } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, type ExpensePaymentMethod } from "@/lib/expense-meta";
import { Label, Section } from "./piezas";
import type { GastoRecurrente } from "./use-gasto-recurrente";

const PAYMENT_METHODS: ExpensePaymentMethod[] = ["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"];

/** Forma de pago, recordatorio y notas del gasto fijo. */
export default function PagoRecurrente({ r }: { r: GastoRecurrente }) {
  const { paymentMethod, setPaymentMethod, reminderEnabled, setReminderEnabled, notes, setNotes } = r;
  return (
    <>
    {/* Método de pago ───────────────────────────────────────── */}
    <Section icon={<Wallet className="h-4 w-4" />} title="Forma de pago">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const active = paymentMethod === m;
          const Icon = m === "yape" || m === "plin" ? Smartphone
            : m === "transferencia" ? Banknote
            : m === "tarjeta" ? CreditCard
            : m === "credito" ? Clock
            : Wallet;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={cn(
                "inline-flex items-center justify-center gap-2 h-11 px-3 rounded-2xl border-2 text-sm font-semibold transition-all",
                active
                  ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-2 ring-primary/30"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          );
        })}
      </div>
    </Section>

    {/* Recordatorio + Notas ────────────────────────────────── */}
    <Section icon={<StickyNote className="h-4 w-4" />} title="Notas y recordatorio">
      <label className="flex items-center gap-3 p-3 rounded-2xl border border-[var(--rule-base)] cursor-pointer hover:border-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={reminderEnabled}
          onChange={(e) => setReminderEnabled(e.target.checked)}
          className="h-5 w-5 rounded accent-primary cursor-pointer"
        />
        <Bell className="h-4 w-4 text-[var(--text-secondary)]" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Recordatorio antes del vencimiento</p>
          <p className="text-xs text-[var(--text-secondary)]">Te avisaremos en notificaciones el día antes que toque pagar.</p>
        </div>
      </label>
      <div>
        <Label className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> Notas internas (opcional)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej. El casero prefiere efectivo, dejar recibo firmado en caja chica..."
          rows={2}
          aria-label="Notas internas"
          className="mt-1 w-full px-3.5 py-2.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium focus:outline-none focus:border-primary resize-none"
        />
      </div>
    </Section>
    </>
  );
}
