"use client";

/**
 * LivesStrip — TS-30 strip "En vivo ahora" para /tiendas.
 *
 * Carrusel horizontal con cards compactos de transmisiones activas.
 * Si no hay lives, no renderiza nada (degradación silenciosa para no
 * ocupar espacio vacío).
 *
 * Sprint 6 marketplace blueprint.
 */

import Link from "next/link";
import Image from "next/image";
import { CircleDot, Users, ArrowRight } from "@buleje/design-system/icons";
import { getLivesNow } from "@/lib/mocks/lives.mock";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export default function LivesStrip({ className }: Props) {
  const lives = getLivesNow();
  if (lives.length === 0) return null;

  return (
    <section
      aria-labelledby="lives-strip-heading"
      className={cn(
        "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2",
        className,
      )}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400 mb-1">
            <CircleDot className="h-3.5 w-3.5 animate-pulse" aria-hidden />
            En vivo ahora
          </p>
          <h2
            id="lives-strip-heading"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]"
          >
            {lives.length === 1
              ? "Hay una transmisión activa"
              : `${lives.length} transmisiones activas`}
          </h2>
        </div>
        <Link
          href="/marketplace/en-vivo"
          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
        >
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {lives.map((l) => (
          <Link
            key={l.id}
            href={`/marketplace/en-vivo/${l.id}`}
            className="group relative flex w-[260px] sm:w-[300px] shrink-0 flex-col rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden transition-all hover:border-rose-300 hover:-translate-y-0.5"
          >
            <div className="relative aspect-video bg-[var(--surface-sunken)]">
              <Image
                src={l.thumbnail}
                alt={l.title}
                fill
                sizes="300px"
                className="object-cover transition-transform group-hover:scale-[1.02]"
              />
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                <CircleDot className="h-3 w-3 animate-pulse" aria-hidden />
                En vivo
              </span>
              {typeof l.viewers === "number" && l.viewers > 0 && (
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                  <Users className="h-3 w-3" aria-hidden />
                  {l.viewers.toLocaleString("es-PE")}
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-snug">
                {l.title}
              </h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)] line-clamp-1">
                {l.storeName}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
