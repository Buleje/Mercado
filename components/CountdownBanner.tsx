"use client";

import { useState, useEffect, startTransition } from "react";
import { Clock, Flame, ChevronRight } from "lucide-react";

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

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1 text-xl sm:text-2xl font-mono font-extrabold tabular-nums min-w-10 text-center">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{label}</span>
    </div>
  );
}

export default function CountdownBanner() {
  const [time, setTime] = useState(getTimeLeft);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => setMounted(true));
    const id = setInterval(() => {
      startTransition(() => setTime(getTimeLeft()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  const scrollToDeals = () => {
    const el = document.getElementById("flash-deals") || document.getElementById("productos");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden text-white" style={{ background: "linear-gradient(90deg, #dc2626, #f97316, #f59e0b)" }}>
      {/* Animated bg pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-2 animate-pulse">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
              🔥 OFERTAS DEL DÍA
            </h3>
            <p className="text-xs opacity-90">¡Aprovecha antes de la medianoche!</p>
          </div>
        </div>

        {/* Center: Countdown */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 opacity-80 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <Digit value={time.h} label="hrs" />
            <span className="text-xl font-bold animate-pulse -mt-3">:</span>
            <Digit value={time.m} label="min" />
            <span className="text-xl font-bold animate-pulse -mt-3">:</span>
            <Digit value={time.s} label="seg" />
          </div>
        </div>

        {/* Right: CTA */}
        <button
          type="button"
          onClick={scrollToDeals}
          className="flex items-center gap-1.5 bg-white text-red-600 font-bold text-sm px-4 py-2 rounded-full hover:bg-white/90 transition-colors shadow-lg"
        >
          Ver ofertas
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
