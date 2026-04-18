"use client";

/**
 * SubscribeAndSaveWidget — Widget "Bodega al Mes" (estilo Amazon Subscribe & Save).
 *
 * Se inserta en el PDP (ProductDetailPage) entre el bloque de cantidad y la
 * accion-bar. Solo se muestra si el producto es `subscribable`.
 *
 * Categorias suscribibles (mock): Abarrotes, Bebidas, Limpieza, Lacteos.
 * Categorias no-suscribibles: Carnes, Verduras.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  Info,
  Repeat,
  ShoppingCart,
} from "@buleje/design-system/icons";
import {
  CardTitle,
  Caption,
} from "@buleje/design-system";
import { cn } from "@/lib/utils";
import {
  FREQUENCY_LABEL,
  useSubscriptions,
  type SubscriptionFrequency,
} from "@/contexts/subscription-context";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FREQUENCIES: SubscriptionFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
];

const FREQUENCY_DAYS: Record<SubscriptionFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

/**
 * Lista de categorias suscribibles. Si la prop `category` encaja, el widget
 * se renderiza. (Para Carnes/Verduras el caller debe no incluir el widget.)
 */
const SUBSCRIBABLE_CATEGORIES = new Set(
  [
    "abarrotes",
    "bebidas",
    "limpieza",
    "lacteos",
    "lácteos",
    "higiene",
    "hogar",
  ].map((c) => c.toLowerCase()),
);

const NON_SUBSCRIBABLE_KEYWORDS = ["carnes", "carne", "verdura", "verduras", "frutas", "fruta"];

export function isSubscribableCategory(category?: string | null): boolean {
  if (!category) return true; // sin categoria = suscribible por defecto
  const c = category.toLowerCase().trim();
  if (NON_SUBSCRIBABLE_KEYWORDS.some((k) => c.includes(k))) return false;
  if (SUBSCRIBABLE_CATEGORIES.has(c)) return true;
  // default permisivo: si no es explicitamente no-suscribible, se permite
  return true;
}

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubscribeAndSaveWidgetProps {
  productId: string | number;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  /** Descuento decimal (default 0.05 = 5 %). */
  discount?: number;
  /** Callback cuando el user cambia su modo. */
  onModeChange?: (mode: "once" | "subscription") => void;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SubscribeAndSaveWidget({
  productId,
  productName,
  productImage,
  unitPrice,
  quantity,
  discount = 0.05,
  onModeChange,
  className,
}: SubscribeAndSaveWidgetProps) {
  const { subscribe } = useSubscriptions();

  const [mode, setMode] = useState<"once" | "subscription">("once");
  const [frequency, setFrequency] = useState<SubscriptionFrequency>("monthly");
  const [subscribed, setSubscribed] = useState(false);

  const subscriptionPrice = useMemo(
    () => unitPrice * (1 - discount),
    [unitPrice, discount],
  );

  const savingsPerDelivery = useMemo(
    () => unitPrice * discount * quantity,
    [unitPrice, discount, quantity],
  );

  const nextDeliveryIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + FREQUENCY_DAYS[frequency]);
    return d.toISOString();
  }, [frequency]);

  const handleModeClick = (next: "once" | "subscription") => {
    setMode(next);
    onModeChange?.(next);
  };

  const handleConfirm = () => {
    subscribe({
      productId: String(productId),
      productName,
      productImage,
      unitPrice,
      frequency,
      quantity,
      discount,
    });
    setSubscribed(true);
    setTimeout(() => setSubscribed(false), 3200);
  };

  return (
    <section
      aria-labelledby="bodega-al-mes-title"
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]",
        "overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <header className="flex items-start gap-3 p-4 border-b border-[var(--rule-soft)]">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
          <Repeat className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle id="bodega-al-mes-title" className="text-[length:var(--ts-sm)]">
              Bodega al Mes
            </CardTitle>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                "border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
                "text-[var(--text-secondary)]",
              )}
            >
              <BadgePercent className="h-3 w-3" aria-hidden />
              Ahorra 5%
            </span>
          </div>
          <Caption className="mt-0.5 text-[var(--text-tertiary)]">
            Tu bodega recuerda por vos. Cancela cuando quieras.
          </Caption>
        </div>
      </header>

      {/* Mode radios */}
      <div role="radiogroup" aria-label="Modo de compra" className="p-4 space-y-2">
        {/* Option: Once */}
        <label
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            mode === "once"
              ? "border-[var(--rule-strong)] bg-[var(--surface-sunken)]"
              : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
          )}
        >
          <input
            type="radio"
            name={`subscription-mode-${productId}`}
            checked={mode === "once"}
            onChange={() => handleModeClick("once")}
            className="mt-1 accent-[var(--text-primary)]"
            aria-label="Compra unica"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                Compra unica
              </span>
              <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                {fmtMoney(unitPrice)}
              </span>
            </div>
            <Caption className="text-[var(--text-tertiary)] mt-0.5">
              Pago una vez. Recibes solo este pedido.
            </Caption>
          </div>
        </label>

        {/* Option: Subscription */}
        <label
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            mode === "subscription"
              ? "border-[var(--rule-strong)] bg-[var(--surface-sunken)]"
              : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
          )}
        >
          <input
            type="radio"
            name={`subscription-mode-${productId}`}
            checked={mode === "subscription"}
            onChange={() => handleModeClick("subscription")}
            className="mt-1 accent-[var(--text-primary)]"
            aria-label="Bodega al Mes"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                  Bodega al Mes
                </span>
                <span
                  className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--data-success)",
                    backgroundColor:
                      "color-mix(in oklch, var(--data-success) 12%, transparent)",
                  }}
                >
                  -5%
                </span>
              </div>
              <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                {fmtMoney(subscriptionPrice)}
              </span>
            </div>
            <Caption className="text-[var(--text-tertiary)] mt-0.5">
              Entrega programada. Pausa o cancela cuando quieras.
            </Caption>

            {/* Frequency selector — only active when subscription selected */}
            {mode === "subscription" && (
              <div className="mt-3 space-y-2.5">
                <div>
                  <label
                    htmlFor={`freq-${productId}`}
                    className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Frecuencia
                  </label>
                  <select
                    id={`freq-${productId}`}
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as SubscriptionFrequency)
                    }
                    className={cn(
                      "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                      "px-3 py-2 text-[length:var(--ts-sm)] text-[var(--text-primary)]",
                      "outline-none focus:border-[var(--rule-strong)]",
                    )}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                  <CalendarClock
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>
                    Primera entrega estimada:{" "}
                    <strong className="font-semibold text-[var(--text-primary)]">
                      {fmtShortDate(nextDeliveryIso)}
                    </strong>
                  </span>
                </div>

                <div
                  className="flex items-start gap-2 p-2.5 rounded-lg text-[length:var(--ts-xs)]"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--data-success) 8%, transparent)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Info
                    className="h-3.5 w-3.5 shrink-0 mt-0.5"
                    style={{ color: "var(--data-success)" }}
                    aria-hidden
                  />
                  <span>
                    Te ahorras{" "}
                    <strong
                      className="font-semibold tabular-nums"
                      style={{ color: "var(--data-success)" }}
                    >
                      {fmtMoney(savingsPerDelivery)}
                    </strong>{" "}
                    en cada entrega.
                  </span>
                </div>
              </div>
            )}
          </div>
        </label>
      </div>

      {/* Confirm CTA — only for subscription mode */}
      {mode === "subscription" && (
        <div className="p-4 pt-0">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={subscribed}
            className={cn(
              "w-full py-3 rounded-lg font-semibold text-[length:var(--ts-sm)]",
              "flex items-center justify-center gap-2 transition-opacity",
              subscribed
                ? "bg-[var(--data-success)] text-white"
                : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
              "disabled:cursor-default",
            )}
          >
            {subscribed ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Suscripcion activada
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Activar Bodega al Mes
              </>
            )}
          </button>
          {subscribed && (
            <Link
              href="/cuenta/suscripciones"
              className="mt-2 block text-center text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
            >
              Ver mis suscripciones
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
