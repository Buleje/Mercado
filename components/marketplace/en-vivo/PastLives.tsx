"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, Clock, Users } from "@buleje/design-system/icons";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface PastLivesProps {
  lives: LiveSession[];
}

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("es-PE");
}

function formatDuration(min: number | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function PastLives({ lives }: PastLivesProps) {
  if (lives.length === 0) return null;

  return (
    <section className="space-y-5" aria-labelledby="past-title">
      <header className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
        <h2
          id="past-title"
          className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold text-[var(--text-primary)]"
        >
          Transmisiones pasadas
        </h2>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {lives.map((live) => (
          <Link
            key={live.id}
            href={`/marketplace/en-vivo/${live.id}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <div className="relative aspect-video bg-[var(--surface-sunken)]">
              <Image
                src={live.thumbnail}
                alt={live.title}
                fill
                sizes="(min-width: 1024px) 260px, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />

              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Grabado
              </span>

              {live.durationMin && (
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                  {formatDuration(live.durationMin)}
                </span>
              )}

              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
                  <Play className="h-5 w-5 text-[var(--text-primary)] fill-current pl-0.5" aria-hidden />
                </span>
              </span>
            </div>

            <div className="flex flex-col gap-1 p-3">
              <h3 className="text-[length:var(--ts-sm)] font-semibold leading-tight text-[var(--text-primary)] line-clamp-2">
                {live.title}
              </h3>
              <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                <Users className="h-3 w-3" aria-hidden />
                {formatViewers(live.viewers)} vistas
              </div>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-clamp-1">
                {live.storeName}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
