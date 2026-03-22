"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";
import { dispatchAppEvent } from "@/lib/events";
import { useSettings } from "@/contexts/settings-context";

const FALLBACK_MESSAGES = [
  { text: "🚚 Delivery gratis en compras desde S/50", link: "#productos", highlight: "S/50" },
  { text: "🎉 Nuevos productos cada semana — ¡Descúbrelos!", link: "#productos", highlight: "cada semana" },
  { text: "💳 Paga con Yape o efectivo contra entrega", link: "#productos", highlight: "Yape" },
  { text: "⭐ 4.8/5 — Los mejores precios de Pucallpa", link: "#testimonios", highlight: "4.8/5" },
];

const ROTATE_MS = 5000;
const DISMISS_KEY = "bsm-announcement-dismissed";

/* Simple hash of message texts to detect content changes */
function messagesHash(msgs: typeof FALLBACK_MESSAGES): string {
  return msgs.map(m => m.text).join("|");
}

export default function AnnouncementBar() {
  const { homepage: hp } = useSettings();
  const messages = hp.announcementMessages?.length ? hp.announcementMessages : FALLBACK_MESSAGES;
  const hash = messagesHash(messages);
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const stored = JSON.parse(raw) as { hash: string; ts: number };
      // Re-show if messages changed or after 24 hours
      if (stored.hash !== messagesHash(hp.announcementMessages?.length ? hp.announcementMessages : FALLBACK_MESSAGES)) return false;
      if (Date.now() - stored.ts > 86_400_000) return false;
      return true;
    } catch { return false; }
  });
  const [scrollHidden, setScrollHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [dismissed, messages.length]);

  // Hide on scroll, restore when back at top
  useEffect(() => {
    if (dismissed) return;
    let prev = false;
    const onScroll = () => {
      const hide = window.scrollY > 42;
      if (hide === prev) return;
      prev = hide;
      startTransition(() => setScrollHidden(hide));
      dispatchAppEvent(hide ? "announcementHidden" : "announcementShown", {});
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ hash, ts: Date.now() })); } catch { /* silent */ }
    // Dispatch event so Header can adjust its top
    dispatchAppEvent("announcementDismissed", {});
  }, [hash]);

  if (!mounted || dismissed || hp.announcementEnabled === false) return null;

  const msg = messages[idx];

  return (
    <div
      id="announcement-bar"
      className="fixed top-0 left-0 right-0 h-11 text-white text-center overflow-hidden shadow-lg"
      style={{
        background: "linear-gradient(90deg, #245c43, #2d6a4f, #245c43)",
        zIndex: 60,
        transform: scrollHidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 animate-[shimmer_3s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} aria-hidden="true" />

      <div className="relative h-full mx-auto max-w-7xl px-12 flex items-center justify-center gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 hidden sm:block text-secondary animate-[pop_2s_ease-in-out_infinite]" />
        <a
          href={msg.link}
          className="hover:underline transition-colors flex items-center gap-1.5 font-bold text-sm tracking-wide"
          onClick={(e) => {
            e.preventDefault();
            const id = msg.link.replace("#", "");
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span key={idx} className="animate-[fadeUp_0.3s_ease-out]">
            {msg.text}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 animate-[nudgeX_1.5s_ease-in-out_infinite]" />
        </a>
        <Sparkles className="h-4 w-4 shrink-0 hidden sm:block text-secondary animate-[pop_2s_ease-in-out_infinite_0.5s]" />
      </div>

      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/20 transition-colors"
        aria-label="Cerrar anuncio"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
