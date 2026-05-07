"use client";

import Link from "next/link";
import Image from "next/image";
import { CircleDot, ArrowRight, Users } from "@buleje/design-system/icons";
import { useLiveViewers } from "@/hooks/useLiveViewers";
import { getLiveNow } from "@/lib/mocks/lives.mock";

/**
 * LiveNowWidget — mini tarjeta que aparece en la homepage del marketplace
 * cuando hay una transmisión activa. Se oculta si no hay live.
 */
export function LiveNowWidget() {
  const live = getLiveNow();
  const viewers = useLiveViewers(live?.viewers ?? 0, Boolean(live));
  if (!live) return null;

  return (
    <Link
      href={`/marketplace/en-vivo/${live.id}`}
      className="group relative mt-4 flex flex-col sm:flex-row items-stretch gap-4 rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] overflow-hidden hover:shadow-md transition-shadow"
      aria-label={`Ir a la transmisión: ${live.title}`}
    >
      <div className="relative h-40 sm:h-auto sm:w-48 shrink-0 bg-[var(--surface-sunken)]">
        <Image
          src={live.thumbnail}
          alt={live.title}
          fill
          sizes="(min-width: 640px) 192px, 100vw"
          className="object-cover transition-transform group-hover:scale-[1.02]"
        />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-500)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white">
          <CircleDot className="h-3 w-3 animate-pulse" aria-hidden />
          En vivo
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5 gap-2">
        <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
          Transmitiendo ahora
        </p>

        <h3 className="text-[length:var(--ts-lg)] font-bold leading-tight text-[var(--text-primary)] line-clamp-2">
          {live.title}
        </h3>

        <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] line-clamp-1">
          {live.storeName}
        </p>

        <div className="mt-1 flex items-center gap-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden />
            {viewers.toLocaleString("es-PE")} mirando
          </span>
        </div>

        <span className="mt-2 inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-bold text-[var(--accent)] group-hover:underline w-fit">
          Ver transmisión
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
