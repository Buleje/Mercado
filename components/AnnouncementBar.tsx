"use client";

import { useState, useEffect, startTransition } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";

const FALLBACK_MESSAGES = [
  { text: "🚚 Delivery gratis en compras desde S/50", link: "#productos", highlight: "S/50" },
  { text: "🎉 Nuevos productos cada semana — ¡Descúbrelos!", link: "#productos", highlight: "cada semana" },
  { text: "💳 Paga con Yape o efectivo contra entrega", link: "#productos", highlight: "Yape" },
  { text: "⭐ 4.8/5 — Los mejores precios de tu zona", link: "#testimonios", highlight: "4.8/5" },
];

const ROTATE_MS = 5000;

// ── Mejora 12: First Purchase Discount Banner ───────────────────────────────
function FirstPurchaseBanner() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const hasPurchased = localStorage.getItem("has-purchased") === "true";
      const dismissed = localStorage.getItem("bsm-first-purchase-dismissed");
      if (hasPurchased) return false;
      if (dismissed && Date.now() - Number(dismissed) < 86_400_000) return false;
      return true;
    } catch { return false; }
  });
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText("BIENVENIDO").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleClose = () => {
    setVisible(false);
    try { localStorage.setItem("bsm-first-purchase-dismissed", String(Date.now())); } catch { /* silent */ }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 text-white text-center shadow-lg"
      style={{
        background: "linear-gradient(90deg, #f97316, #e76f51)",
        zIndex: 61,
        padding: "10px 16px",
      }}
    >
      <div className="relative mx-auto max-w-7xl flex items-center justify-center gap-3 flex-wrap">
        <span className="text-sm font-bold tracking-wide">
          🎉 Primera compra: 10% de descuento con codigo <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded">BIENVENIDO</span>
        </span>
        <button
          onClick={handleCopy}
          className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold transition-colors"
        >
          {copied ? "✓ Copiado" : "Copiar codigo"}
        </button>
        <button
          onClick={handleClose}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/20 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AnnouncementBar() {
  const { homepage: hp } = useSettings();
  const messages = hp.announcementMessages?.length ? hp.announcementMessages : FALLBACK_MESSAGES;
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [messages.length]);

  if (!mounted || hp.announcementEnabled === false) return <FirstPurchaseBanner />;

  const msg = messages[idx];

  return (
    <>
    <FirstPurchaseBanner />
    <div
      id="announcement-bar"
      className="fixed top-0 left-0 right-0 h-11 text-white text-center overflow-hidden shadow-lg"
      style={{
        background: "linear-gradient(90deg, #009690, #00B4A6, #009690)",
        zIndex: 60,
      }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 animate-[shimmer_3s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} aria-hidden="true" />

      <div className="relative h-full mx-auto max-w-7xl px-6 flex items-center justify-center gap-2.5">
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
    </div>
    </>
  );
}
