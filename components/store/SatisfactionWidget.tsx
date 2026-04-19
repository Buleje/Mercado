"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, X } from "@buleje/design-system/icons";
import { usePathname } from "next/navigation";

type Rating = "bien" | "regular" | "mal";

const LS_KEY = "satisfaction-widget-hidden-until";

export default function SatisfactionWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const until = localStorage.getItem(LS_KEY);
    if (until && Date.now() < Number(until)) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  }, []);

  const hideFor24h = useCallback(() => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(LS_KEY, String(until));
    setHidden(true);
  }, []);

  const handleRate = async (rating: Rating) => {
    setSent(true);
    try {
      await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, page: pathname }),
      });
    } catch { /* ignore */ }
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      hideFor24h();
    }, 2000);
  };

  // Don't show on admin pages
  if (pathname?.startsWith("/admin")) return null;
  if (hidden) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white dark:bg-zinc-800 border border-[var(--rule-base)] dark:border-zinc-700 shadow-lg text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:shadow-xl transition-all hover:scale-105"
        >
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="hidden sm:inline">Tu experiencia</span>
          <span className="sm:hidden">Opina</span>
        </button>
      )}

      {open && (
        <div className="bg-white dark:bg-zinc-800 border border-[var(--rule-base)] dark:border-zinc-700 rounded-2xl shadow-xl p-4 w-64 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">
              {sent ? "Gracias" : "Tu experiencia"}
            </p>
            {!sent && (
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}
          </div>

          {sent ? (
            <p className="text-xs text-gray-500 dark:text-zinc-400 text-center py-2">
              Tu opinion nos ayuda a mejorar
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => handleRate("bien")}
                className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">&#128522;</span>
                <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-500 dark:text-zinc-400">Bien</span>
              </button>
              <button
                onClick={() => handleRate("regular")}
                className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors group"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">&#128528;</span>
                <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-500 dark:text-zinc-400">Regular</span>
              </button>
              <button
                onClick={() => handleRate("mal")}
                className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">&#128542;</span>
                <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-500 dark:text-zinc-400">Mal</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
