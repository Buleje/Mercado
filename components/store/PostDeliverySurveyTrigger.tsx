"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import PostDeliverySurvey from "./PostDeliverySurvey";

const LS_PREFIX = "bsm-pending-survey-";
const MIN_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Mejora 14: Post-delivery survey trigger
 *
 * When an order is delivered, the store layout stores a pending survey
 * in localStorage. This component checks for pending surveys and
 * shows a modal after 30 min but before 24h.
 *
 * To mark a survey as pending from anywhere:
 *   localStorage.setItem('bsm-pending-survey-{orderId}', Date.now().toString())
 */
export default function PostDeliverySurveyTrigger() {
  const [pendingSurvey, setPendingSurvey] = useState<{ orderId: string; ts: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Scan localStorage for pending surveys
    const checkSurveys = () => {
      try {
        const now = Date.now();
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(LS_PREFIX)) continue;
          const ts = Number(localStorage.getItem(key));
          if (isNaN(ts)) { localStorage.removeItem(key); continue; }
          const age = now - ts;
          // Expired (>24h) — clean up
          if (age > MAX_AGE_MS) { localStorage.removeItem(key); continue; }
          // Ready to show (>30min)
          if (age >= MIN_WAIT_MS) {
            const orderId = key.replace(LS_PREFIX, "");
            setPendingSurvey({ orderId, ts });
            return;
          }
        }
      } catch { /* silent */ }
    };

    checkSurveys();
    // Re-check every 5 minutes
    const interval = setInterval(checkSurveys, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = useCallback((_rating: number, _comment: string) => {
    if (!pendingSurvey) return;
    // Remove from localStorage
    try { localStorage.removeItem(LS_PREFIX + pendingSurvey.orderId); } catch { /* silent */ }
    setSubmitted(true);
    // Auto-close after 3 seconds
    setTimeout(() => {
      setPendingSurvey(null);
      setSubmitted(false);
    }, 3000);
  }, [pendingSurvey]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // If dismissed, remove from localStorage so it won't show again
    if (pendingSurvey) {
      try { localStorage.removeItem(LS_PREFIX + pendingSurvey.orderId); } catch { /* silent */ }
    }
  }, [pendingSurvey]);

  // Listen for custom event from order status page
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        try {
          localStorage.setItem(LS_PREFIX + detail.orderId, String(Date.now()));
        } catch { /* silent */ }
      }
    };
    window.addEventListener("bsm:orderDelivered", handler);
    return () => window.removeEventListener("bsm:orderDelivered", handler);
  }, []);

  if (!pendingSurvey || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full p-5 relative animate-in fade-in zoom-in-95">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Cerrar encuesta"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        {submitted ? (
          <div className="text-center py-6 space-y-3">
            <span className="text-5xl">🎉</span>
            <p className="text-lg font-bold text-gray-900 dark:text-white">¡Gracias por tu opinión!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tu feedback nos ayuda a mejorar cada día.</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-4">
              <span className="text-4xl">📦</span>
              <p className="text-base font-bold text-gray-900 dark:text-white mt-2">
                ¿Cómo estuvo tu pedido?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Pedido #{pendingSurvey.orderId.slice(-6).toUpperCase()}
              </p>
            </div>
            <PostDeliverySurvey
              orderId={pendingSurvey.orderId}
              onSubmit={handleSubmit}
            />
          </>
        )}
      </div>
    </div>
  );
}
