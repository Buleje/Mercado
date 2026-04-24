"use client";

/**
 * SubscriptionCard — Tarjeta individual de suscripcion en /cuenta/suscripciones.
 *
 * Acciones: pausar / reanudar / cancelar / saltar próxima / cambiar frecuencia.
 * Estado visual: active (verde subtil), paused (neutro), cancelled (gris opaco).
 */

import Image from "next/image";
import {
  CalendarClock,
  CalendarDays,
  MoreVertical,
  Pause,
  Play,
  CalendarOff,
  Sliders,
  XCircle,
} from "@buleje/design-system/icons";
import { Caption } from "@buleje/design-system";
import {
  FREQUENCY_LABEL,
  type SubscriptionPlan,
} from "@/contexts/subscription-context";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysUntil(iso: string, now: number): number {
  return Math.ceil(
    (new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24),
  );
}

export interface SubscriptionCardProps {
  subscription: SubscriptionPlan;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSkipNext: () => void;
  onChangeFrequency: () => void;
}

export default function SubscriptionCard({
  subscription,
  onPause,
  onResume,
  onCancel,
  onSkipNext,
  onChangeFrequency,
}: SubscriptionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, [subscription.nextDelivery]);

  const isActive = subscription.status === "active";
  const isPaused = subscription.status === "paused";
  const isCancelled = subscription.status === "cancelled";

  const subscriptionPrice =
    subscription.unitPrice * (1 - subscription.discount);
  const totalPerDelivery = subscriptionPrice * subscription.quantity;
  const daysToNext = now === null ? 99 : daysUntil(subscription.nextDelivery, now);

  return (
    <article
      className={cn(
        "rounded-xl border overflow-hidden bg-[var(--surface-raised)]",
        isCancelled
          ? "border-[var(--rule-soft)] opacity-60"
          : "border-[var(--rule-base)]",
      )}
    >
      {/* Status strip */}
      <div
        className="h-1 w-full"
        style={{
          backgroundColor: isActive
            ? "var(--data-success)"
            : isPaused
              ? "var(--data-warning)"
              : "var(--rule-soft)",
        }}
        aria-hidden
      />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Image */}
          <div
            className={cn(
              "h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]",
              "flex items-center justify-center",
            )}
          >
            {subscription.productImage ? (
              // Use plain img since product images may be external or missing
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={subscription.productImage}
                alt={subscription.productName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Image
                src="/placeholder-product.svg"
                alt=""
                width={48}
                height={48}
                className="opacity-40"
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] leading-tight line-clamp-2">
                  {subscription.productName}
                </h3>
                <Caption className="text-[var(--text-tertiary)] mt-0.5">
                  Cantidad: {subscription.quantity} ·{" "}
                  {FREQUENCY_LABEL[subscription.frequency]}
                </Caption>
              </div>

              {/* Menu trigger */}
              {!isCancelled && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((p) => !p)}
                    aria-label="Mas opciones"
                    aria-expanded={menuOpen}
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                      "hover:bg-[var(--surface-sunken)] transition-colors",
                    )}
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </button>
                  {menuOpen && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div
                        role="menu"
                        className={cn(
                          "absolute right-0 top-full mt-1 z-20 min-w-48",
                          "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]",
                          "shadow-lg overflow-hidden",
                        )}
                      >
                        <MenuButton
                          onClick={() => {
                            onChangeFrequency();
                            setMenuOpen(false);
                          }}
                          icon={Sliders}
                          label="Cambiar frecuencia"
                        />
                        {isActive && (
                          <MenuButton
                            onClick={() => {
                              onSkipNext();
                              setMenuOpen(false);
                            }}
                            icon={CalendarOff}
                            label="Saltar próxima entrega"
                          />
                        )}
                        <MenuButton
                          onClick={() => {
                            onCancel();
                            setMenuOpen(false);
                          }}
                          icon={XCircle}
                          label="Cancelar suscripcion"
                          destructive
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Next delivery + status */}
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                {isActive ? (
                  <>
                    <CalendarClock
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--data-success)" }}
                      aria-hidden
                    />
                    <span>
                      Próxima: <strong>{fmtDate(subscription.nextDelivery)}</strong>
                      {daysToNext <= 3 && daysToNext >= 0 && (
                        <span
                          className="ml-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold uppercase"
                          style={{
                            color: "var(--data-warning)",
                            backgroundColor:
                              "color-mix(in oklch, var(--data-warning) 12%, transparent)",
                          }}
                        >
                          Pronto
                        </span>
                      )}
                    </span>
                  </>
                ) : isPaused ? (
                  <>
                    <Pause
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--data-warning)" }}
                      aria-hidden
                    />
                    <span>Pausada</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    <span>Cancelada</span>
                  </>
                )}
              </div>

              <div className="text-right">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                    {fmtMoney(subscription.unitPrice * subscription.quantity)}
                  </span>
                  <span className="text-[length:var(--ts-base)] font-extrabold text-[var(--text-primary)] tabular-nums">
                    {fmtMoney(totalPerDelivery)}
                  </span>
                </div>
                <Caption className="text-[var(--text-tertiary)]">
                  por entrega
                </Caption>
              </div>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        {!isCancelled && (
          <div className="mt-4 pt-4 border-t border-[var(--rule-soft)] flex items-center gap-2 flex-wrap">
            {isActive ? (
              <>
                <ActionButton onClick={onPause} icon={Pause} label="Pausar" />
                <ActionButton
                  onClick={onSkipNext}
                  icon={CalendarOff}
                  label="Saltar próxima"
                />
                <ActionButton
                  onClick={onChangeFrequency}
                  icon={CalendarDays}
                  label="Frecuencia"
                />
              </>
            ) : (
              <ActionButton
                onClick={onResume}
                icon={Play}
                label="Reanudar"
                primary
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ActionButton({
  onClick,
  icon: Icon,
  label,
  primary = false,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
        "text-[length:var(--ts-xs)] font-semibold transition-colors",
        primary
          ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90"
          : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-strong)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function MenuButton({
  onClick,
  icon: Icon,
  label,
  destructive = false,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-[length:var(--ts-sm)]",
        "hover:bg-[var(--surface-sunken)] transition-colors text-left",
        destructive
          ? "text-[var(--data-error)]"
          : "text-[var(--text-primary)]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

// Re-export for card status visual queries elsewhere
export const STATUS_ACCENT = {
  active: "var(--data-success)",
  paused: "var(--data-warning)",
  cancelled: "var(--rule-soft)",
};

