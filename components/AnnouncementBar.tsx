"use client";

import { useState, useEffect, startTransition } from "react";
import { X, ChevronRight, Sparkles } from "@buleje/design-system/icons";
import { useSettings } from "@/contexts/settings-context";

const FALLBACK_MESSAGES = [
  { text: "Delivery gratis en compras desde S/50", link: "#productos", highlight: "S/50" },
  { text: "Nuevos productos cada semana — descubrilos", link: "#productos", highlight: "cada semana" },
  { text: "Pagá con Yape o efectivo contra entrega", link: "#productos", highlight: "Yape" },
  { text: "4.8 / 5 — los mejores precios de tu zona", link: "#testimonios", highlight: "4.8/5" },
];

const ROTATE_MS = 5000;

// ── Mejora 12: First Purchase Discount Banner ───────────────────────────────
function FirstPurchaseBanner() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const hasPurchased = localStorage.getItem("has-purchased") === "true";
      const dismissed = localStorage.getItem("buleje-first-purchase-dismissed");
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
    try { localStorage.setItem("buleje-first-purchase-dismissed", String(Date.now())); } catch { /* silent */ }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-center border-b border-[var(--text-primary)]"
      style={{ zIndex: 61, padding: "8px 16px" }}
    >
      <div className="relative mx-auto max-w-7xl flex items-center justify-center gap-3 flex-wrap">
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] hidden sm:inline">
          Nuevo cliente
        </span>
        <span className="h-3.5 w-px bg-white/20 shrink-0 hidden sm:inline-block" />
        <span className="text-[13px] font-medium text-[var(--surface-canvas)]">
          Primera compra con <strong className="font-semibold">10% de descuento</strong>
          <span className="mx-2 text-white/40">·</span>
          Código <code className="font-mono text-[length:var(--ts-2xs)] px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] tracking-wider">BIENVENIDO</code>
        </span>
        <button
          onClick={handleCopy}
          className="px-2.5 py-1 rounded-full border border-white/30 hover:bg-white/10 text-[length:var(--ts-2xs)] font-semibold transition-colors"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          onClick={handleClose}
          className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center text-white/60 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
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
      className="fixed top-0 left-0 right-0 h-10 bg-gray-900 text-white text-center overflow-hidden border-b border-gray-900"
      style={{ zIndex: 60 }}
    >
      <div className="relative h-full mx-auto max-w-7xl px-6 flex items-center justify-center gap-3">
        <Sparkles className="h-3.5 w-3.5 shrink-0 hidden sm:block text-white/50" strokeWidth={1.75} />
        <a
          href={msg.link}
          className="transition-colors flex items-center gap-1.5 text-xs font-semibold hover:text-white/80"
          onClick={(e) => {
            e.preventDefault();
            const id = msg.link.replace("#", "");
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span key={idx} className="animate-[fadeUp_0.3s_ease-out]">
            {msg.text}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        </a>
      </div>
    </div>
    </>
  );
}
