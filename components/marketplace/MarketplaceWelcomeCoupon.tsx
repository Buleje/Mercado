"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, X } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const COUPON_CODE = "BIENVENIDO10";
const STORAGE_KEY = "marketplace:welcome-coupon:v1";
const DURATION_MS = 24 * 60 * 60 * 1000; // 24h from first visit

function formatTime(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s,
  ).padStart(2, "0")}`;
}

export default function MarketplaceWelcomeCoupon() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "dismissed") {
        setDismissed(true);
        return;
      }
      let exp: number;
      if (raw) {
        exp = Number(raw);
        if (Number.isNaN(exp) || exp < Date.now()) {
          setDismissed(true);
          return;
        }
      } else {
        exp = Date.now() + DURATION_MS;
        localStorage.setItem(STORAGE_KEY, String(exp));
      }
      setExpiresAt(exp);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!expiresAt || dismissed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (dismissed || !expiresAt) return null;
  const remaining = expiresAt - now;
  if (remaining <= 0) return null;

  return (
    <AnimatePresence>
      <m.div
        id="welcome-coupon"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed bottom-5 left-5 z-40 max-w-xs w-[calc(100%-2.5rem)] sm:w-[320px]",
          "bg-gray-900 dark:bg-white text-white dark:text-gray-900",
          "rounded-xl overflow-hidden border border-gray-900 dark:border-gray-200",
          "shadow-xl shadow-gray-900/10",
        )}
        role="dialog"
        aria-label="Cupón de bienvenida"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar"
          className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full flex items-center justify-center text-white/60 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 hover:bg-white/10 dark:hover:bg-gray-100 transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <div className="p-5">
          <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-white/55 dark:text-gray-500">
            <Gift className="h-3 w-3" strokeWidth={2} />
            Cupón · nuevos clientes
          </div>

          <p className="mt-3 text-[28px] font-extrabold tracking-tight leading-none">
            10<span className="text-white/60 dark:text-gray-400 text-xl">%</span> OFF
          </p>
          <p className="mt-1 text-xs text-white/70 dark:text-gray-500">
            En tu primera compra
          </p>

          {/* Countdown minimal */}
          <div className="mt-4 flex items-baseline justify-between border-t border-white/10 dark:border-gray-200 pt-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white/55 dark:text-gray-500">
              Vence en
            </span>
            <span className="font-mono text-base font-bold tabular-nums">
              {formatTime(remaining)}
            </span>
          </div>

          {/* Code */}
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-white/10 dark:bg-gray-100 hover:bg-white/15 dark:hover:bg-gray-200 transition-colors border border-white/15 dark:border-gray-200"
          >
            <span className="font-mono text-xs font-bold tracking-[0.15em] text-white dark:text-gray-900">
              {COUPON_CODE}
            </span>
            {copied ? (
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-emerald-300 dark:text-emerald-600">
                <Check className="h-3 w-3" strokeWidth={2} />
                Copiado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-white/70 dark:text-gray-600">
                <Copy className="h-3 w-3" strokeWidth={1.75} />
                Copiar
              </span>
            )}
          </button>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
