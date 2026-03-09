"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";

const MESSAGES = [
  { text: "🚚 Delivery gratis en compras desde S/50", link: "#productos", highlight: "S/50" },
  { text: "🎉 Nuevos productos cada semana — ¡Descúbrelos!", link: "#productos", highlight: "cada semana" },
  { text: "💳 Paga con Yape o efectivo contra entrega", link: "#productos", highlight: "Yape" },
  { text: "⭐ 4.8/5 — Los mejores precios de Pucallpa", link: "#testimonios", highlight: "4.8/5" },
];

const ROTATE_MS = 5000;

export default function AnnouncementBar() {
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [scrollHidden, setScrollHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [dismissed]);

  // Hide on scroll, restore when back at top
  useEffect(() => {
    if (dismissed) return;
    let prev = false;
    const onScroll = () => {
      const hide = window.scrollY > 42;
      if (hide === prev) return;
      prev = hide;
      startTransition(() => setScrollHidden(hide));
      window.dispatchEvent(new CustomEvent(hide ? "bsm:announcementHidden" : "bsm:announcementShown"));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Dispatch event so Header can adjust its top
    window.dispatchEvent(new CustomEvent("bsm:announcementDismissed"));
  }, []);

  if (!mounted || dismissed) return null;

  const msg = MESSAGES[idx];

  return (
    <div
      id="announcement-bar"
      className="fixed top-0 left-0 right-0 h-11 text-white text-center overflow-hidden shadow-lg"
      style={{
        background: "linear-gradient(90deg, #1b4332, #2d6a4f, #1b4332)",
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
