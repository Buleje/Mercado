"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from '@/components/admin/shared/Field';
import { LoadingState } from "@buleje/design-system";
import {
  Zap, Banknote, Smartphone, CreditCard, CheckCircle,
  Clock, X, History, TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentMethod = "efectivo" | "yape" | "plin" | "tarjeta";

interface QuickCharge {
  id: string;
  amount: number;
  payment: PaymentMethod;
  createdAt: string;
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bodega_quick_charges";
const TODAY_KEY = () => new Date().toISOString().slice(0, 10);

function loadTodayCharges(): QuickCharge[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${TODAY_KEY()}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCharge(charge: QuickCharge) {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_KEY}_${TODAY_KEY()}`;
  try {
    const raw = localStorage.getItem(key);
    const list: QuickCharge[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(key, JSON.stringify([charge, ...list]));
  } catch { /* ignore */ }
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { key: "efectivo", label: "Efectivo", icon: Banknote },
  { key: "yape",     label: "Yape",     icon: Smartphone },
  { key: "plin",     label: "Plin",     icon: Smartphone },
  { key: "tarjeta",  label: "Tarjeta",  icon: CreditCard },
];

const QUICK_AMOUNTS = [1, 2, 5, 10, 20, 50];

// ── Component ─────────────────────────────────────────────────────────────────

interface QuickChargeModeProps {
  className?: string;
}

export default function QuickChargeMode({ className }: QuickChargeModeProps) {
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<QuickCharge[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadTodayCharges());
    inputRef.current?.focus();
  }, []);

  const handleCharge = useCallback(async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Ingresa un monto valido");
      return;
    }
    if (parsed > 9999) {
      setError("Para montos mayores usa el POS normal");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          items: [{
            productId: 0,
            name: note.trim() || "Venta rápida",
            price: parsed,
            quantity: 1,
            unit: "",
          }],
          payment,
          amountPaid: parsed,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Error al registrar venta");
      }

      // Save to localStorage history
      const charge: QuickCharge = {
        id: Date.now().toString(),
        amount: parsed,
        payment,
        createdAt: new Date().toISOString(),
        note: note.trim() || undefined,
      };
      saveCharge(charge);
      setHistory((prev) => [charge, ...prev]);

      setSuccess(true);
      setAmount("");
      setNote("");
      setTimeout(() => {
        setSuccess(false);
        inputRef.current?.focus();
      }, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar cobro");
    } finally {
      setLoading(false);
    }
  }, [amount, payment, note]);

  // Keyboard shortcut: Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && amount && !loading) handleCharge();
  };

  const parsed = parseFloat(amount);
  const validAmount = !isNaN(parsed) && parsed > 0;

  // Daily stats
  const dailyTotal = history.reduce((s, c) => s + c.amount, 0);
  const dailyCount = history.length;

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)]/50">
        <Zap className="h-4 w-4 text-secondary" />
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cobro Rápido</span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)] dark:text-muted">Para ventas rapidas sin producto</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Daily summary strip */}
        {dailyCount > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10">
            <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs text-[var(--text-secondary)] dark:text-muted flex-1">
              Hoy: <strong className="text-primary">{dailyCount}</strong> cobro{dailyCount !== 1 ? "s" : ""} — <strong className="text-primary">{fmt(dailyTotal)}</strong>
            </span>
            <button type="button" onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <History className="h-3 w-3" />
              {showHistory ? "Ocultar" : "Ver"}
            </button>
          </div>
        )}

        {/* History panel */}
        {showHistory && history.length > 0 && (
          <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] divide-y divide-gray-50 dark:divide-card-border overflow-hidden">
            {history.slice(0, 10).map((charge) => (
              <div key={charge.id} className="flex items-center gap-2 px-3 py-2 text-xs bg-[var(--surface-raised)]">
                <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-[var(--text-secondary)] dark:text-muted">{fmtTime(charge.createdAt)}</span>
                <span className="flex-1 text-[var(--text-secondary)] dark:text-muted truncate">{charge.note ?? "Venta rápida"}</span>
                <span className="font-semibold text-primary">{fmt(charge.amount)}</span>
                <span className="text-[var(--text-tertiary)] dark:text-muted capitalize">{charge.payment}</span>
              </div>
            ))}
          </div>
        )}

        {/* Amount input */}
        <div className="space-y-2">
          <Field label="Monto a cobrar" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block">
            {(id) => (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-[var(--text-tertiary)] select-none">S/</span>
                <input
                  id={id}
                  ref={inputRef}
                  type="number"
                  min="0.01"
                  step="0.10"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(""); }}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  className="w-full pl-12 pr-4 py-4 text-3xl font-extrabold rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary transition-colors text-center"
                />
              </div>
            )}
          </Field>

          {/* Quick amount chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v.toString())}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                  parsed === v
                    ? "bg-primary text-white border-primary"
                    : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] dark:text-muted border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary"
                )}
              >
                S/{v}
              </button>
            ))}
          </div>
        </div>

        {/* Optional note */}
        <Field label="Descripcion (opcional)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: agua, pan, cargador..."
            maxLength={80}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:border-primary"
          />
        </Field>

        {/* Payment method */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block">Metodo de pago</span>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_OPTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPayment(key)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all",
                  payment === key
                    ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-gray-300"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
            <X className="h-3.5 w-3.5 text-[var(--data-error-500)] shrink-0" />
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
            <CheckCircle className="h-3.5 w-3.5 text-[var(--data-success-500)] shrink-0" />
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">Cobro registrado</p>
          </div>
        )}

        {/* CTA button */}
        <button
          type="button"
          onClick={handleCharge}
          disabled={!validAmount || loading || success}
          className={cn(
            "w-full py-4 rounded-xl font-extrabold text-xl transition-all flex items-center justify-center gap-3",
            success
              ? "bg-primary/10 text-white"
              : validAmount && !loading
              ? "bg-primary text-white hover:bg-primary/90 active:scale-98"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
          )}
        >
          {loading ? (
            <LoadingState variant="inline" size="sm" />
          ) : success ? (
            <CheckCircle className="h-6 w-6" />
          ) : (
            <Zap className="h-6 w-6" />
          )}
          {success ? "Registrado" : validAmount ? `Cobrar ${fmt(parsed)}` : "Cobrar"}
        </button>

        {/* Hint */}
        <p className="text-center text-xs text-[var(--text-tertiary)] dark:text-muted">
          Solo para ventas rapidas menores a S/ 10. Para ventas con productos usa el POS.
        </p>
      </div>
    </div>
  );
}
