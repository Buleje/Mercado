"use client";

import Image from "next/image";
import { Play, CircleDot, Users, Store } from "@buleje/design-system/icons";
import { useLiveViewers } from "@/hooks/useLiveViewers";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface LivePlayerProps {
  live: LiveSession;
  /** Si true, el player funciona en modo detalle (más alto + controles). */
  large?: boolean;
  onOpen?: () => void;
}

/**
 * LivePlayer — placeholder del video de transmisión.
 *
 * Por ahora es un poster con botón play + animación sutil tipo "en vivo"
 * (pulse en el badge + brillo en borde). Cuando haya WebRTC/HLS real,
 * reemplazar por `<video>` con controles.
 */
export function LivePlayer({ live, large = false, onOpen }: LivePlayerProps) {
  const viewers = useLiveViewers(live.viewers, live.status === "live");

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-sunken)] shadow-lg"
      data-testid="live-player"
    >
      {/* Poster image */}
      <div className="relative w-full aspect-video">
        <Image
          src={live.thumbnail}
          alt={`Transmisión: ${live.title}`}
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 800px, 100vw"
          priority={large}
        />

        {/* Gradient overlay bottom */}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-500)] px-2.5 py-1 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-white shadow">
            <CircleDot className="h-3 w-3 animate-pulse" aria-hidden />
            En vivo
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2.5 py-1 text-[length:var(--ts-xs)] font-semibold text-white">
            <Users className="h-3 w-3" aria-hidden />
            {viewers.toLocaleString("es-PE")} mirando
          </span>
        </div>

        {/* Play button */}
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`Ver transmisión: ${live.title}`}
        >
          <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/90 text-[var(--text-primary)] shadow-2xl transition-transform hover:scale-105">
            <Play className="h-7 w-7 sm:h-9 sm:w-9 fill-current pl-1" aria-hidden />
          </span>
        </button>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <div className="flex items-center gap-2 text-[length:var(--ts-xs)] font-medium opacity-90 mb-1">
            <Store className="h-3.5 w-3.5" aria-hidden />
            {live.storeName}
          </div>
          <h3 className="text-[length:var(--ts-lg)] sm:text-[length:var(--ts-xl)] font-bold leading-tight line-clamp-2">
            {live.title}
          </h3>
        </div>
      </div>
    </div>
  );
}
