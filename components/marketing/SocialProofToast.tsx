"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * SocialProofToast — floating toast that shows recent platform activity.
 * "Maria acaba de hacer un pedido — hace 3 min"
 *
 * Fetches from /api/platform/activity and cycles through feed items.
 * Shown on marketing pages to boost conversion (social proof).
 */

type FeedItem = {
  type: "order" | "signup" | "stat";
  text: string;
  timeAgo: string;
};

const TYPE_ICONS: Record<string, string> = {
  order: "🛒",
  signup: "🏪",
  stat: "📊",
};

export default function SocialProofToast() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Fetch activity feed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/platform/activity");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.feed) && data.feed.length > 0) {
            setFeed(data.feed);
          }
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cycle through feed items
  const showNext = useCallback(() => {
    if (feed.length === 0 || dismissed) return;
    setVisible(true);
    // Auto-hide after 4 seconds
    const hideTimer = setTimeout(() => setVisible(false), 4000);
    // Show next item after 6 seconds (4s visible + 2s gap)
    const nextTimer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % feed.length);
    }, 6000);
    return () => { clearTimeout(hideTimer); clearTimeout(nextTimer); };
  }, [feed, dismissed]);

  // Start cycling after initial delay
  useEffect(() => {
    if (feed.length === 0 || dismissed) return;

    // First show after 5 seconds
    const initialTimer = setTimeout(() => {
      showNext();
    }, 5000);

    // Then every 8 seconds
    const interval = setInterval(() => {
      showNext();
    }, 8000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [feed, dismissed, showNext]);

  if (feed.length === 0 || dismissed) return null;

  const item = feed[currentIndex];
  if (!item) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 z-40 max-w-xs"
        >
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <span className="text-lg shrink-0 mt-0.5">
              {TYPE_ICONS[item.type] ?? "📢"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-snug">
                {item.text}
              </p>
              {item.timeAgo && (
                <p className="text-[length:var(--ts-2xs)] text-slate-400 mt-0.5">
                  {item.timeAgo}
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-300 hover:text-slate-500 shrink-0"
              aria-label="Cerrar"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
