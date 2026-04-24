"use client";

/**
 * GroupBuyCard — Compra grupal vecinal: 4 vecinos → 15% OFF.
 *
 * Flow:
 *   1. Usuario selecciona producto que quiere comprar grupal
 *   2. Tap "Invitar 3 vecinos mas" → genera link compartible
 *   3. Cuando 4 familias confirman: 15% OFF automatico a todos
 *   4. Cada quien paga lo suyo, entrega conjunta (ahorra costo delivery)
 *
 * MVP UI-only: el backend de grupos se implementa en siguiente iteracion.
 * Por ahora el componente genera link share + muestra progress visual
 * de 1/4 → 4/4 y explica el mecanismo.
 *
 * Impacto esperado: +80% volumen por agregacion social, viralidad en
 * grupos de WhatsApp de vecinos/condominio.
 */

import { useState, useCallback } from "react";
import {
  Users,
  Share2,
  MessageCircle,
  TrendingDown,
  Check,
  Copy,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  productName?: string;
  unitPrice?: number;
  /** Descuento al alcanzar el tope del grupo (default 15%) */
  discountPercent?: number;
  /** Vecinos necesarios (default 4) */
  groupSize?: number;
  /** Cuantos vecinos ya confirmaron (0-groupSize) */
  currentMembers?: number;
  /** Link dinamico del grupo — si no se provee, se usa el origen + slug */
  groupUrl?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function GroupBuyCard({
  productName = "Arroz Costeño 5 kg",
  unitPrice = 22.5,
  discountPercent = 15,
  groupSize = 4,
  currentMembers = 1,
  groupUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  const progress = Math.min(100, Math.round((currentMembers / groupSize) * 100));
  const remainingMembers = Math.max(0, groupSize - currentMembers);
  const finalPrice = unitPrice * (1 - discountPercent / 100);
  const saved = unitPrice - finalPrice;

  const computedUrl = useCallback(() => {
    if (groupUrl) return groupUrl;
    if (typeof window === "undefined") return "#";
    return `${window.location.origin}/marketplace/grupo?producto=${encodeURIComponent(productName)}`;
  }, [groupUrl, productName]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(computedUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [computedUrl]);

  const handleWhatsApp = useCallback(() => {
    const url = computedUrl();
    const msg = encodeURIComponent(
      `Vecinos, estoy armando una compra grupal en Buleje: ${productName} a S/ ${finalPrice.toFixed(2)} (${discountPercent}% OFF) si somos ${groupSize}. Faltan ${remainingMembers} — sumate acá: ${url}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [computedUrl, productName, finalPrice, discountPercent, groupSize, remainingMembers]);

  const isComplete = currentMembers >= groupSize;

  return (
    <section
      aria-label="Compra grupal vecinal"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header editorial */}
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Compra grupal vecinal
            </p>
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5">
              {groupSize} vecinos, {discountPercent}% OFF
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
              Armá un grupo con {groupSize - 1} vecinos/as y todos pagan menos.
              Entrega conjunta ahorra delivery también.
            </p>
          </div>
        </div>
      </div>

      {/* Producto + precio con y sin descuento */}
      <div className="mx-5 sm:mx-6 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
          Producto del grupo
        </p>
        <p className="text-sm font-bold text-[var(--text-primary)]">{productName}</p>
        <div className="mt-3 flex items-baseline gap-3">
          <p className="text-2xl font-extrabold tabular-nums text-[var(--accent)]">
            {fmt(finalPrice)}
          </p>
          <p className="text-sm font-medium text-[var(--text-tertiary)] line-through tabular-nums">
            {fmt(unitPrice)}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold">
            <TrendingDown className="h-3 w-3" strokeWidth={2} aria-hidden />
            −{discountPercent}%
          </span>
        </div>
        <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
          Ahorrás {fmt(saved)} por unidad
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-5 sm:px-6 mt-5">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Progreso del grupo
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
            {currentMembers} / {groupSize}
          </p>
        </div>
        <div
          aria-hidden
          className="h-2 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          {isComplete
            ? "¡Grupo completo! Todos tienen el descuento activo"
            : `Faltan ${remainingMembers} vecino${remainingMembers === 1 ? "" : "s"} para activar ${discountPercent}% OFF`}
        </p>
      </div>

      {/* CTAs share */}
      <div className="px-5 sm:px-6 pt-4 pb-5 space-y-2">
        <button
          type="button"
          onClick={handleWhatsApp}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white py-3 text-sm font-bold hover:bg-[#1ea34d] transition-colors active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Invitar vecinos por WhatsApp
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] py-3 text-sm font-bold hover:border-[var(--accent)]/40 transition-colors active:scale-[0.98]"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
              ¡Link copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Copiar link del grupo
            </>
          )}
        </button>
      </div>

      {/* Cómo funciona — edu */}
      <details className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <summary className="list-none flex items-center justify-between px-5 sm:px-6 py-3 cursor-pointer hover:bg-[var(--surface-raised)]">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            ¿Cómo funciona?
          </span>
          <Share2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
        </summary>
        <ol className="px-5 sm:px-6 pb-4 space-y-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          <li>1. Compartís el link con vecinos de tu barrio o condominio.</li>
          <li>2. Cada uno confirma su compra en el link.</li>
          <li>
            3. Cuando son {groupSize}, se activa el {discountPercent}% OFF para todos.
          </li>
          <li>4. Entrega conjunta el mismo día — repartidor pasa una vez.</li>
        </ol>
      </details>
    </section>
  );
}
