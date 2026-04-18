"use client";

import Link from "next/link";
import { ArrowLeft, CircleDot, Users, Clock } from "@buleje/design-system/icons";
import { LivePlayer } from "@/components/marketplace/en-vivo/LivePlayer";
import { LiveDescription } from "./LiveDescription";
import { LiveSidebar } from "./LiveSidebar";
import { useLiveViewers } from "@/hooks/useLiveViewers";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface LiveDetailPageProps {
  live: LiveSession;
}

function formatStatusLabel(live: LiveSession, viewers: number): { text: string; active: boolean } {
  if (live.status === "live") {
    return { text: `${viewers.toLocaleString("es-PE")} personas mirando ahora`, active: true };
  }
  if (live.status === "upcoming") {
    const d = new Date(live.startsAt);
    return {
      text: `Empieza ${d.toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`,
      active: false,
    };
  }
  return {
    text: `${viewers.toLocaleString("es-PE")} vistas totales`,
    active: false,
  };
}

export function LiveDetailPage({ live }: LiveDetailPageProps) {
  const viewers = useLiveViewers(live.viewers, live.status === "live");
  const status = formatStatusLabel(live, viewers);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Back */}
      <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/marketplace/en-vivo"
            aria-label="Volver al hub de transmisiones"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </Link>

          <div className="ml-auto inline-flex items-center gap-2">
            {status.active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error)]/10 px-2.5 py-1 text-[length:var(--ts-xs)] font-semibold text-[var(--data-error)]">
                <CircleDot className="h-3 w-3 animate-pulse" aria-hidden />
                <Users className="h-3 w-3" aria-hidden />
                {status.text}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                <Clock className="h-3 w-3" aria-hidden />
                {status.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-5">
            <LivePlayer live={live} large />
            <LiveDescription live={live} />
          </div>

          <div className="lg:col-span-1">
            <LiveSidebar live={live} />
          </div>
        </div>
      </main>
    </div>
  );
}
