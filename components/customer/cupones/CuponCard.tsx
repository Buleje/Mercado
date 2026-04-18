"use client";

import { useState } from "react";
import { Copy, Check, Clock, Tag, Truck, Percent, DollarSign } from "lucide-react";
import type { MockCupon } from "@/lib/mocks/cupones.mock";

type Props = {
  cupon: MockCupon;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Sin vencimiento";
  }
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function discountLabel(cupon: MockCupon): string {
  if (cupon.discountType === "shipping") return "Envio gratis";
  if (cupon.discountType === "percent") return `${cupon.discountValue}%`;
  return `S/ ${cupon.discountValue}`;
}

function discountIcon(type: MockCupon["discountType"]): React.ComponentType<{ className?: string }> {
  if (type === "shipping") return Truck;
  if (type === "percent") return Percent;
  return DollarSign;
}

export default function CuponCard({ cupon }: Props) {
  const [copied, setCopied] = useState(false);
  const days = daysUntil(cupon.expiresAt);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const Icon = discountIcon(cupon.discountType);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(cupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
      {/* Notch — estilo "boleta" */}
      <div
        aria-hidden="true"
        className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-gray-50/60 dark:bg-gray-950"
      />
      <div
        aria-hidden="true"
        className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-gray-50/60 dark:bg-gray-950"
      />

      <div className="flex items-stretch">
        {/* Lado izquierdo: descuento */}
        <div className="flex w-28 flex-col items-center justify-center border-r border-dashed border-gray-200 bg-gray-50/50 p-4 text-center dark:border-gray-800 dark:bg-gray-950/40">
          <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <div className="mt-2 text-2xl font-bold leading-none text-gray-900 dark:text-white">
            {discountLabel(cupon)}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {cupon.category ?? "Cupon"}
          </div>
        </div>

        {/* Lado derecho: info */}
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {cupon.title}
            </h3>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              {cupon.description}
            </p>
          </div>

          <dl className="space-y-1 text-xs">
            {cupon.minPurchase !== null && (
              <Row
                label="Minimo de compra"
                value={`S/ ${cupon.minPurchase.toFixed(2)}`}
                icon={Tag}
              />
            )}
            <Row
              label="Vence"
              value={fmtDate(cupon.expiresAt)}
              icon={Clock}
              accent={isUrgent ? "text-amber-700 dark:text-amber-300" : undefined}
            />
          </dl>

          {isUrgent && (
            <p className="-mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Solo quedan {days} {days === 1 ? "dia" : "dias"}
            </p>
          )}

          <div className="mt-auto flex items-center gap-2 pt-2">
            <code className="flex-1 truncate rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              {cupon.code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              aria-label={`Copiar codigo ${cupon.code}`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className={["font-medium", accent ?? "text-gray-700 dark:text-gray-300"].join(" ")}>
        {value}
      </dd>
    </div>
  );
}
