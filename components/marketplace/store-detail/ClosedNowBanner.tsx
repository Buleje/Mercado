"use client";

/**
 * ClosedNowBanner v3 (2026-05-10) — diseño app-moderna / Rappi-like.
 *
 *  - Strip oscuro (ink) sticky bajo el navbar.
 *  - Countdown MM:SS:HH a la apertura en mono prominente.
 *  - Status pulsante a la izquierda.
 *  - CTA "Ver horarios" blanca → abre HorariosModal.
 */

import { useEffect, useState } from "react";
import HorariosModal from "./HorariosModal";
import { Calendar } from "@buleje/design-system/icons";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function useCountdown(targetISO?: string | null) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!targetISO) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetISO]);
  if (!targetISO) return null;
  const target = new Date(targetISO).getTime();
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  return {
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
    expired: diff <= 0,
  };
}

interface ClosedNowBannerProps {
  hours: unknown;
  nextOpeningAt?: string | null;
  storeName: string;
}

export default function ClosedNowBanner({ hours, nextOpeningAt, storeName }: ClosedNowBannerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const countdown = useCountdown(nextOpeningAt);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="relative bg-[var(--text-primary)] text-[var(--surface-canvas)]"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex items-center gap-3 sm:gap-5">
          {/* Status pill izquierda */}
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-white/10 backdrop-blur text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] shrink-0"
          >
            <span aria-hidden className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-warning-500)] opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-warning-500)]" />
            </span>
            Cerrada
          </span>

          {/* Bloque central — countdown + store name */}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-x-3 gap-y-0.5">
            {countdown && !countdown.expired ? (
              <>
                <p
                  className="font-mono tabular-nums text-base sm:text-lg font-extrabold leading-none whitespace-nowrap"
                  aria-label={`Faltan ${countdown.h} horas ${countdown.m} minutos para abrir`}
                >
                  {pad(countdown.h)}
                  <span className="opacity-40">:</span>
                  {pad(countdown.m)}
                  <span className="opacity-40">:</span>
                  {pad(countdown.s)}
                </p>
                <p className="text-[length:var(--ts-xs)] sm:text-sm text-white/70 leading-tight truncate">
                  hasta que <strong className="font-bold text-white">{storeName}</strong> abra ·
                  podés armar tu pedido ahora.
                </p>
              </>
            ) : (
              <p className="text-sm text-white/85 leading-tight truncate">
                <strong className="font-extrabold text-white">{storeName}</strong> está cerrada ·
                podés armar tu pedido y lo entregamos al abrir.
              </p>
            )}
          </div>

          {/* CTA Ver horarios */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white text-[var(--text-primary)] text-sm font-extrabold hover:bg-white/90 active:scale-[0.97] transition-all shrink-0 shadow-sm"
            aria-haspopup="dialog"
            aria-expanded={modalOpen}
          >
            <Calendar className="h-4 w-4" strokeWidth={2.25} />
            <span className="hidden sm:inline">Ver horarios</span>
            <span className="sm:hidden">Horarios</span>
          </button>
        </div>
      </div>

      <HorariosModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        storeName={storeName}
        hours={hours}
        isOpenNow={false}
        nextOpeningAt={nextOpeningAt}
      />
    </>
  );
}
