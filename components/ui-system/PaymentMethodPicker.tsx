"use client";

/**
 * PaymentMethodPicker — Selector de metodo de pago con iconos Peru.
 *
 * Opciones: Yape, Plin, Efectivo, Tarjeta (Culqi/Stripe), POS.
 * Cada opcion muestra icono + label + subtitulo + badge opcional.
 *
 * A11y: radiogroup con arrow keys + Enter/Space selecciona.
 *
 * Uso:
 *   <PaymentMethodPicker
 *     value={method}
 *     onChange={setMethod}
 *     available={["yape", "cash", "card"]}
 *   />
 */

import { Wallet, Banknote, CreditCard, Smartphone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type PaymentMethod = "yape" | "plin" | "cash" | "card" | "pos";

interface MethodConfig {
  id: PaymentMethod;
  label: string;
  subtitle: string;
  Icon: typeof Wallet;
  color: string;
  badge?: string;
}

const METHODS: Record<PaymentMethod, MethodConfig> = {
  yape: {
    id: "yape",
    label: "Yape",
    subtitle: "Pago instantáneo al celular",
    Icon: Smartphone,
    color: "text-[#631B7C]",
    badge: "Más usado",
  },
  plin: {
    id: "plin",
    label: "Plin",
    subtitle: "BCP, Interbank, BBVA, ScotiaBank",
    Icon: Smartphone,
    color: "text-[#00B3DB]",
  },
  cash: {
    id: "cash",
    label: "Efectivo",
    subtitle: "Paga al recibir el pedido",
    Icon: Banknote,
    color: "text-[var(--accent)]",
  },
  card: {
    id: "card",
    label: "Tarjeta",
    subtitle: "Visa, Mastercard, Amex",
    Icon: CreditCard,
    color: "text-[var(--text-primary)]",
  },
  pos: {
    id: "pos",
    label: "POS al recibir",
    subtitle: "El repartidor lleva POS",
    Icon: Wallet,
    color: "text-[var(--text-primary)]",
  },
};

interface Props {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  /** Metodos disponibles. Default: yape, plin, cash, card */
  available?: PaymentMethod[];
  /** Label del grupo */
  label?: string;
  className?: string;
}

export default function PaymentMethodPicker({
  value,
  onChange,
  available = ["yape", "plin", "cash", "card"],
  label = "¿Cómo vas a pagar?",
  className,
}: Props) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("space-y-2", className)}>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      {available.map((m) => {
        const cfg = METHODS[m];
        const selected = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m)}
            className={cn(
              "w-full flex items-center gap-3 rounded-2xl border-2 p-3 transition-all text-left",
              selected
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-primary)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
            )}
          >
            <div
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                selected ? "bg-[var(--surface-raised)]" : "bg-[var(--surface-sunken)]",
              )}
            >
              <cfg.Icon className={cn("h-5 w-5", cfg.color)} strokeWidth={2} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-[var(--text-primary)]">{cfg.label}</p>
                {cfg.badge && (
                  <span className="inline-block rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
                    {cfg.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{cfg.subtitle}</p>
            </div>
            <div
              aria-hidden
              className={cn(
                "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center",
                selected ? "border-[var(--accent)]" : "border-[var(--rule-base)]",
              )}
            >
              {selected && <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
