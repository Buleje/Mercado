"use client";

import { useState, useCallback } from "react";
import { Users, Banknote, Smartphone, CreditCard } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { PaymentLine, PaymentLineMethod } from "./POSPaymentModal";

interface POSSplitPaymentProps {
  total: number;
  onSplitPayments: (payments: PaymentLine[]) => void;
  onCancel: () => void;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

const METHODS: {
  id: PaymentLineMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "yape", label: "Yape", icon: Smartphone },
  { id: "plin", label: "Plin", icon: Smartphone },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
];

export default function POSSplitPayment({
  total,
  onSplitPayments,
  onCancel,
}: POSSplitPaymentProps) {
  const [people, setPeople] = useState(0);
  const [payments, setPayments] = useState<PaymentLine[]>([]);

  const setupSplit = useCallback(
    (count: number) => {
      const base = Math.floor((total / count) * 100) / 100;
      const remainder = Math.round((total - base * count) * 100) / 100;
      const lines: PaymentLine[] = Array.from({ length: count }, (_, i) => ({
        method: "efectivo" as PaymentLineMethod,
        amount: i === count - 1 ? base + remainder : base,
      }));
      setPeople(count);
      setPayments(lines);
    },
    [total]
  );

  const updateMethod = useCallback(
    (idx: number, method: PaymentLineMethod) => {
      setPayments((prev) =>
        prev.map((p, i) => (i === idx ? { ...p, method } : p))
      );
    },
    []
  );

  const sumPayments = payments.reduce((acc, p) => acc + p.amount, 0);
  // Tolerancia 1 centavo (acumulación de decimales en reparto N personas).
  const isPaymentsValid = payments.length > 0 && Math.abs(sumPayments - total) <= 0.01;

  const handleConfirm = useCallback(() => {
    if (!isPaymentsValid) return;
    onSplitPayments(payments);
  }, [payments, onSplitPayments, isPaymentsValid]);

  // Step 1: Choose number of people
  if (people === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Dividir entre cuantas personas?
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setupSplit(n)}
              className="flex-1 min-w-16 py-3 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:border-primary hover:bg-primary/5 transition-colors"
            >
              {n}
            </button>
          ))}
          <div className="flex-1 min-w-16">
            <input
              type="number"
              min="2"
              max="10"
              placeholder="Otro"
              className="w-full py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-center outline-none focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = Number((e.target as HTMLInputElement).value);
                  if (val >= 2 && val <= 10) setupSplit(val);
                }
              }}
              onBlur={(e) => {
                const val = Number(e.target.value);
                if (val >= 2 && val <= 10) setupSplit(val);
              }}
            />
          </div>
        </div>
        <button
          onClick={onCancel}
          className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors py-1"
        >
          Cancelar
        </button>
      </div>
    );
  }

  // Step 2: Show split details
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {fmt(total)} &divide; {people} = {fmt(total / people)} por persona
          </span>
        </div>
        <button
          onClick={() => {
            setPeople(0);
            setPayments([]);
          }}
          className="text-[length:var(--ts-xs)] text-primary hover:underline font-semibold"
        >
          Cambiar
        </button>
      </div>

      <div className="space-y-2">
        {payments.map((line, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
          >
            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-20 shrink-0">
              Persona {idx + 1}
            </span>
            <div className="flex gap-1 flex-1">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateMethod(idx, m.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[length:var(--ts-2xs)] font-bold border transition-colors",
                    line.method === m.id
                      ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-transparent text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                  )}
                >
                  <m.icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] w-16 text-right shrink-0">
              {fmt(line.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isPaymentsValid}
          aria-disabled={!isPaymentsValid}
          title={!isPaymentsValid ? `Suma de pagos (${fmt(sumPayments)}) no coincide con total (${fmt(total)})` : undefined}
          className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          Confirmar division
        </button>
      </div>
    </div>
  );
}
