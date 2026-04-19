"use client";

import { useState, useEffect, startTransition } from "react";
import { Clock, ChevronRight } from "@buleje/design-system/icons";
import { useSettings } from "@/contexts/settings-context";
import SectionPlaceholder from "@/components/SectionPlaceholder";

function getTimeLeft() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s };
}

// Canonical teal wash soft — identidad Buleje (ADR-075)
const TEAL_WASH_SOFT =
  "linear-gradient(90deg, color-mix(in oklch, var(--accent) 10%, transparent), color-mix(in oklch, var(--accent) 5%, transparent))";

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-[var(--text-primary)] text-[var(--surface-canvas)] rounded-md px-2.5 py-1 text-lg sm:text-xl font-mono font-bold tabular-nums min-w-10 text-center">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider mt-1 text-[var(--text-tertiary)] font-medium">{label}</span>
    </div>
  );
}

export default function CountdownBanner({
  showEmpty = false,
  emptyVariant = "admin",
}: {
  /** If the section is pinned visible but countdownEnabled is false, show a placeholder instead of nothing. */
  showEmpty?: boolean;
  emptyVariant?: "admin" | "public";
} = {}) {
  const [time, setTime] = useState(getTimeLeft);
  const [mounted, setMounted] = useState(false);
  const { homepage: hp } = useSettings();

  useEffect(() => {
    startTransition(() => setMounted(true));
    const id = setInterval(() => {
      startTransition(() => setTime(getTimeLeft()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  if (hp.countdownEnabled === false) {
    if (!showEmpty) return null;
    return (
      <SectionPlaceholder
        title="Proximamente"
        hint="Configura el banner de cuenta regresiva desde Mi Tienda en el panel admin"
        cols={4}
        icon={Clock}
        variant={emptyVariant}
        publicTitle="Proximamente"
      />
    );
  }

  const scrollToDeals = () => {
    const el = document.getElementById("flash-deals") || document.getElementById("productos");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative overflow-hidden border-y border-[var(--rule-base)]"
      style={{ background: TEAL_WASH_SOFT }}
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Title + neutral clock icon (no pulse) */}
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold tracking-tight text-[var(--text-primary)]">
              {hp.countdownTitle}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{hp.countdownSubtitle}</p>
          </div>
        </div>

        {/* Center: Countdown (tabular nums, neutral separators) */}
        <div className="flex items-center gap-1.5">
          <Digit value={time.h} label="hrs" />
          <span className="text-lg font-bold text-[var(--text-tertiary)] -mt-3">:</span>
          <Digit value={time.m} label="min" />
          <span className="text-lg font-bold text-[var(--text-tertiary)] -mt-3">:</span>
          <Digit value={time.s} label="seg" />
        </div>

        {/* Right: CTA */}
        <button
          type="button"
          onClick={scrollToDeals}
          className="inline-flex items-center gap-1.5 bg-[var(--accent)] text-white font-medium text-sm px-4 py-2 rounded-lg hover:bg-[var(--accent-600)] transition-colors"
        >
          {hp.countdownCtaText}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
