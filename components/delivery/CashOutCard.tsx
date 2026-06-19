"use client";

/**
 * CashOutCard — "Cobra cuando quieras". El repartidor ve su saldo disponible
 * (ganancias completadas − retiros) y solicita un retiro a Yape.
 *
 * Patrón Rappi/Uber "Cobra ya". El saldo SIEMPRE viene del backend
 * (GET /api/delivery/me/payouts); el monto se valida en el servidor dentro de
 * una transacción serializable (anti-fraude). Bordes rectos, tuteo peruano.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Banknote,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  X,
} from "@buleje/design-system/icons";
import { MIN_PAYOUT_SOLES } from "@/lib/delivery/payout";

interface Balance {
  lifetime: number;
  withdrawn: number;
  pending: number;
  available: number;
}
interface PayoutRow {
  id: string;
  amount: number;
  yapeNumber: string;
  status: string;
  note: string | null;
  createdAt: string;
}

const fmt = (n: number) => n.toFixed(2);

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

const STATUS: Record<
  string,
  { Icon: typeof Clock; label: string; cls: string }
> = {
  pending: { Icon: Clock, label: "En proceso", cls: "text-[var(--data-warning-600)]" },
  paid: { Icon: CheckCircle, label: "Pagado", cls: "text-[var(--data-success-600)]" },
  rejected: { Icon: XCircle, label: "Rechazado", cls: "text-[var(--data-error-500)]" },
};

export default function CashOutCard({ defaultYape }: { defaultYape?: string }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [history, setHistory] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/payouts", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { balance: Balance; history: PayoutRow[] };
      setBalance(json.balance);
      setHistory(json.history);
    } catch {
      /* degrada bien: si falla, la card queda en su último estado */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const available = balance?.available ?? 0;
  const canWithdraw = available >= MIN_PAYOUT_SOLES;

  return (
    <section
      aria-label="Tu saldo para retirar"
      className="border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            <Wallet className="h-4 w-4" strokeWidth={2.25} />
            Tu saldo
          </p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
            S/ {loading ? "—" : fmt(available)}
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            {balance && balance.pending > 0
              ? `S/ ${fmt(balance.pending)} en proceso · S/ ${fmt(balance.withdrawn)} retirado`
              : `Retiro mínimo S/ ${MIN_PAYOUT_SOLES}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canWithdraw}
          className="shrink-0 inline-flex items-center gap-2 h-12 px-5 text-base font-extrabold text-white bg-[var(--accent)] border-2 border-[var(--accent)] hover:bg-[var(--accent-600,var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Banknote className="h-5 w-5" strokeWidth={2.25} />
          Retirar a Yape
        </button>
      </div>

      {!canWithdraw && !loading && (
        <p className="mt-3 text-sm font-semibold text-[var(--text-tertiary)]">
          Completa más entregas para llegar al mínimo de S/ {MIN_PAYOUT_SOLES}.
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-5 border-t-2 border-[var(--rule-base)] pt-4">
          <p className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Tus retiros
          </p>
          <ul className="space-y-2">
            {history.slice(0, 5).map((p) => {
              const st = STATUS[p.status] ?? STATUS.pending;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                      S/ {fmt(p.amount)}
                    </p>
                    <p className="text-xs font-semibold text-[var(--text-tertiary)]">
                      {new Date(p.createdAt).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                      })}{" "}
                      · Yape {p.yapeNumber}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${st.cls}`}>
                    <st.Icon className="h-4 w-4" strokeWidth={2.25} />
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {open && (
        <CashOutModal
          available={available}
          defaultYape={defaultYape}
          onClose={() => setOpen(false)}
          onDone={(b, p) => {
            setBalance(b);
            setHistory((h) => [{ ...p }, ...h]);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function CashOutModal({
  available,
  defaultYape,
  onClose,
  onDone,
}: {
  available: number;
  defaultYape?: string;
  onClose: () => void;
  onDone: (b: Balance, p: PayoutRow) => void;
}) {
  const [amount, setAmount] = useState("");
  const [yape, setYape] = useState(
    defaultYape && /^9\d{8}$/.test(defaultYape) ? defaultYape : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Escribe un monto válido.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/delivery/me/payouts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ amount: amt, yapeNumber: yape.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "No pudimos procesar el retiro.");
        return;
      }
      onDone(json.balance as Balance, json.payout as PayoutRow);
    } catch {
      setError("Falló la conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Retirar a Yape"
        className="w-full max-w-sm bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-extrabold text-[var(--text-primary)]">Retirar a Yape</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="payout-amount" className="text-sm font-bold text-[var(--text-secondary)]">
              Monto (S/)
            </label>
            <button
              type="button"
              onClick={() => setAmount(fmt(available))}
              className="text-sm font-extrabold text-[var(--accent)] hover:underline"
            >
              Retirar todo · S/ {fmt(available)}
            </button>
          </div>
          <input
            id="payout-amount"
            type="number"
            inputMode="decimal"
            min={MIN_PAYOUT_SOLES}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Mínimo S/ ${MIN_PAYOUT_SOLES}`}
            className="w-full h-12 px-4 text-base font-bold tabular-nums border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="payout-yape" className="block text-sm font-bold text-[var(--text-secondary)] mb-1.5">
            Número de Yape
          </label>
          <input
            id="payout-yape"
            type="tel"
            inputMode="numeric"
            maxLength={9}
            value={yape}
            onChange={(e) => setYape(e.target.value.replace(/\D/g, ""))}
            placeholder="9XXXXXXXX"
            className="w-full h-12 px-4 text-base font-bold tabular-nums tracking-wider border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full h-12 inline-flex items-center justify-center gap-2 text-base font-extrabold text-white bg-[var(--accent)] border-2 border-[var(--accent)] hover:bg-[var(--accent-600,var(--accent))] disabled:opacity-60 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Procesando…
            </>
          ) : (
            <>
              <Banknote className="h-5 w-5" strokeWidth={2.25} /> Confirmar retiro
            </>
          )}
        </button>
        <p className="text-xs font-semibold text-[var(--text-tertiary)] text-center">
          Te yapeamos a tu número en cuanto el dueño confirme el retiro.
        </p>
      </div>
    </div>
  );
}
