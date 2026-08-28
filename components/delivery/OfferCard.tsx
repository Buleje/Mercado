"use client";

/**
 * OfferCard — tarjeta de oferta de entrega para el repartidor.
 * Extraído de PartnerDashboard para habilitar memo y evitar re-renders
 * cuando el array de ofertas cambia por polling (el comparador solo
 * re-renderiza si cambia id, status, expiresAt, feeOffered o secsRemaining).
 *
 * El countdown NO vive aquí: PartnerDashboard mantiene un único setInterval(1000)
 * y pasa secsRemaining como prop. Así N ofertas = 1 timer en lugar de N timers.
 */

import { memo } from "react";
import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { MotoIcon, PinIcon, TimerIcon } from "./icons";

export interface Offer {
  id: string;
  orderId: string;
  status: string;
  expiresAt: string;
  distanceKm: number;
  feeOffered: number;
  attempt: number;
  order: {
    id: string;
    customerName: string;
    customerLocation: string | null;
    total: number;
  };
}

interface OfferCardProps {
  offer: Offer;
  secsRemaining: number;
}

function arePropsEqual(prev: OfferCardProps, next: OfferCardProps): boolean {
  const a = prev.offer;
  const b = next.offer;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.expiresAt === b.expiresAt &&
    a.feeOffered === b.feeOffered &&
    prev.secsRemaining === next.secsRemaining
  );
}

function OfferCardImpl({ offer, secsRemaining }: OfferCardProps) {
  const secs = secsRemaining;
  const urgent = secs <= 30;
  const mins = Math.floor(secs / 60);
  const ss = secs % 60;

  return (
    <Link
      href={`/delivery-app/oferta/${offer.id}`}
      className={`group block border-2 bg-[var(--surface-raised)] p-5 transition-all hover:translate-y-[-2px] hover:shadow-lg ${
        urgent ? "border-[var(--brand-danger)]" : "border-[var(--accent)]"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Pago al repartidor
          </p>
          <p className="mt-1 text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">
            S/ {Number(offer.feeOffered).toFixed(2)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm font-extrabold tabular-nums ${
            urgent
              ? "bg-[var(--brand-danger)] text-white"
              : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          }`}
        >
          <TimerIcon className="h-4 w-4" />
          {String(mins).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-start gap-2 text-sm">
          <PinIcon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
          <span className="text-[var(--text-primary)] font-semibold line-clamp-2">
            {offer.order.customerLocation ?? "Sin dirección"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <MotoIcon className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{Number(offer.distanceKm).toFixed(1)} km</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span className="font-semibold">{offer.order.customerName}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--rule-base)]">
        <span className="text-sm font-bold text-[var(--text-secondary)]">
          Total cliente: S/ {Number(offer.order.total).toFixed(2)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--accent)] group-hover:translate-x-1 transition-transform">
          Aceptar
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

export const OfferCard = memo(OfferCardImpl, arePropsEqual);
