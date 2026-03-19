"use client";

import { useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { ShoppingCart, MessageCircle, ArrowRight, Truck, Star, Zap, Package } from "lucide-react";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";
import { useSettings } from "@/contexts/settings-context";

function computeGreeting() {
  const h = new Date().getHours();
  const m = new Date().getMonth();
  const seasonal = m === 11 || m === 0 ? " 🎄" : m >= 6 && m <= 8 ? " 🧣" : "";
  if (h >= 5 && h < 12) return `Buenos días${seasonal}`;
  if (h >= 12 && h < 18) return `Buenas tardes${seasonal}`;
  return `Buenas noches${seasonal}`;
}

export default function Hero() {
  const { homepage: hp, deliveryConfig } = useSettings();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    startTransition(() => setGreeting(computeGreeting()));
  }, []);

  /* Compute store open/closed status from delivery hours — client-only to avoid hydration mismatch */
  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const [mounted, setMounted] = useState(false);
  const [storeStatus, setStoreStatus] = useState<{ open: boolean; label: string; closing?: boolean }>({ open: false, label: "" });
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const now = new Date();
    const dayName = DAY_NAMES[now.getDay()];
    const todayConfig = deliveryConfig.hours.find(h => h.day === dayName);
    if (!todayConfig || !todayConfig.enabled) { setStoreStatus({ open: false, label: "Cerrado hoy" }); return; }
    const [oH, oM] = todayConfig.open.split(":").map(Number);
    const [cH, cM] = todayConfig.close.split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < oH * 60 + oM || nowMin >= cH * 60 + cM) { setStoreStatus({ open: false, label: "Cerrado" }); return; }
    const remaining = cH * 60 + cM - nowMin;
    if (remaining <= 30) setStoreStatus({ open: true, label: `Cierra en ${remaining}min`, closing: true });
    else setStoreStatus({ open: true, label: "Abierto ahora" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryConfig.hours]);

  return (
    <section id="inicio" className="relative overflow-hidden" style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes liveRing {
          0%   { transform: scale(1); opacity: 0.9; }
          60%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes floatBadge {
          0%,100% { transform: translateY(0) rotate(-2deg); }
          50%      { transform: translateY(-8px) rotate(2deg); }
        }
        @keyframes chipIn {
          from { opacity: 0; transform: translateY(12px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hero-stat-chip { animation: chipIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both; }
      `}</style>

      {/* Deep background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(155deg, #0d0a1f 0%, #1e1b4b 15%, #312e81 35%, #4c1d95 55%, #1e1b4b 80%, #0d0a1f 100%)",
      }} aria-hidden="true" />



      {/* Static background glows — no animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div style={{
          position: "absolute", top: "-30%", right: "-20%",
          width: "80vw", height: "80vw",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.06) 40%, transparent 65%)",
          filter: "blur(80px)",
        }} />
        <div style={{
          position: "absolute", bottom: "-25%", left: "-10%",
          width: "65vw", height: "65vw",
          background: "radial-gradient(ellipse, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.03) 40%, transparent 65%)",
          filter: "blur(100px)",
        }} />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.25) 0.5px, transparent 0.5px)",
        backgroundSize: "36px 36px",
        opacity: 0.1,
      }} aria-hidden="true" />

      {/* ═══════════════════════════════════════════
          MAIN LAYOUT — split screen on desktop
      ═══════════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-28 md:py-0" style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center w-full">

          {/* ── LEFT: Text content ── */}
          <div className="flex flex-col text-center lg:text-left">

            {/* Live badge */}
            <div className="animate-[fadeDown_0.5s_ease-out] self-center lg:self-start" style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              borderRadius: "9999px",
              border: `1px solid ${mounted && storeStatus.open ? "rgba(96,165,250,0.3)" : "rgba(239,68,68,0.3)"}`,
              background: mounted && storeStatus.open ? "rgba(59,130,246,0.08)" : "rgba(239,68,68,0.08)", backdropFilter: "blur(16px)",
              padding: "0.4rem 1.2rem", marginBottom: "1.5rem",
            }}>
              <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: mounted && storeStatus.open ? "#22c55e" : "#ef4444", animation: mounted && storeStatus.open ? "liveRing 2.2s ease-out infinite" : "none" }} />
                <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: mounted && storeStatus.open ? "#22c55e" : "#ef4444", display: "block" }} />
              </span>
              <span style={{ color: mounted && storeStatus.open ? "#86efac" : "#fca5a5", fontSize: "0.75rem", fontWeight: 700 }}>{mounted ? storeStatus.label : ""}</span>
              <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>Pucallpa, Ucayali</span>
            </div>

            {/* Greeting — client-only to avoid SSR mismatch */}
            {hp.heroGreetingEnabled && greeting && (
              <p className="animate-[fadeDown_0.4s_ease-out_both]" style={{
                fontSize: "clamp(0.95rem,1.8vw,1.15rem)",
                color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: "0.5rem",
              }}>
                {greeting} 👋
              </p>
            )}

            {/* Main heading */}
            <h1 className="animate-[fadeDown_0.5s_ease-out_0.1s_both]" style={{
              fontSize: "clamp(2.6rem,5.5vw,4.2rem)",
              fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.035em",
              color: "#fff", marginBottom: "1.5rem",
            }}>
              {hp.heroTitle}{" "}
              <span style={{
                background: "linear-gradient(130deg, #818cf8 0%, #60a5fa 35%, #fbbf24 65%, #818cf8 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                display: "inline-block",
              }}>{hp.heroTitleAccent}</span>
              <br />
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "85%" }}>en menos de 30 min</span>
            </h1>

            {/* Subtitle */}
            <p className="animate-[fadeDown_0.5s_ease-out_0.2s_both]" style={{
              fontSize: "clamp(1rem,1.9vw,1.15rem)", color: "rgba(255,255,255,0.52)",
              marginBottom: "2.2rem", lineHeight: 1.75, maxWidth: "36rem",
            }}>
              {hp.heroSubtitle}
            </p>

            {/* CTA row */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.3s_both]" style={{
              display: "flex", flexWrap: "wrap", gap: "1rem",
              marginBottom: "2.5rem", justifyContent: "center",
            }} data-lg-justify="flex-start">
              <Link
                href={hp.heroCta1Link}
                onClick={() => trackCTAClick({ source: "hero", destination: hp.heroCta1Link, ctaText: hp.heroCta1Text })}
                className="group relative overflow-hidden"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.7rem",
                  borderRadius: "1rem", padding: "1.1rem 2.5rem",
                  fontSize: "1rem", fontWeight: 800, color: "#fff",
                  background: "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)",
                  boxShadow: "0 8px 32px -4px rgba(99,102,241,0.6), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)",
                  transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
                }}
              >
                {/* Shimmer overlay */}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)" }}
                />
                <ShoppingCart style={{ width: 20, height: 20, position: "relative", zIndex: 1 }} />
                <span style={{ position: "relative", zIndex: 1 }}>{hp.heroCta1Text}</span>
                <ArrowRight style={{ width: 16, height: 16, position: "relative", zIndex: 1 }} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href={hp.heroCta2Link}
                onClick={() => trackWhatsAppClick("hero")}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.6rem",
                  borderRadius: "1rem", padding: "1.1rem 2.5rem",
                  fontSize: "1rem", fontWeight: 700, color: "#fff",
                  background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
                }}
              >
                <MessageCircle style={{ width: 20, height: 20 }} />
                {hp.heroCta2Text}
              </a>
            </div>

            {/* Social proof stats — animated chips */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.4s_both]" style={{
              display: "flex", flexWrap: "wrap", gap: "0.75rem",
              justifyContent: "center",
            }}>
              {[
                { icon: Star, value: "4.8/5", label: "Rating", color: "#fbbf24", delay: "0.45s" },
                { icon: Package, value: "+800", label: "Clientes", color: "#818cf8", delay: "0.55s" },
                { icon: Truck, value: "~30min", label: "Delivery", color: "#3b82f6", delay: "0.65s" },
                { icon: Zap, value: "24/7", label: "Atención", color: "#22c55e", delay: "0.75s" },
              ].map(({ icon: Icon, value, label, color, delay }) => (
                <div
                  key={label}
                  className="hero-stat-chip"
                  style={{
                    animationDelay: delay,
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    padding: "0.55rem 1rem",
                    borderRadius: "0.75rem",
                    background: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: color + "20",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon style={{ width: 13, height: 13, color }} />
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 800, lineHeight: 1 }}>{value}</div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem", fontWeight: 500 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Product showcase — CSS only, zero JS ── */}
          <div className="hidden lg:flex flex-col items-center justify-center relative" style={{ minHeight: 520 }}>

            {/* Product category grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.875rem", width: 390, zIndex: 2 }}>
              {([
                { emoji: "🥩", name: "Carnes",    color: "#fca5a5" },
                { emoji: "🥦", name: "Verduras",  color: "#86efac" },
                { emoji: "🍎", name: "Frutas",    color: "#fcd34d" },
                { emoji: "🥛", name: "Lácteos",   color: "#93c5fd" },
                { emoji: "🍞", name: "Panadería", color: "#fdba74" },
                { emoji: "🧃", name: "Bebidas",   color: "#a5f3fc" },
                { emoji: "🧹", name: "Limpieza",  color: "#c4b5fd" },
                { emoji: "🍿", name: "Snacks",    color: "#fda4af" },
                { emoji: "🥚", name: "Huevos",    color: "#fde68a" },
              ] as const).map(({ emoji, name, color }) => (
                <div key={name} style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "1rem",
                  padding: "1.25rem 0.5rem",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
                  userSelect: "none",
                }}>
                  <span style={{ fontSize: "2.25rem", lineHeight: 1 }}>{emoji}</span>
                  <span style={{ color, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" }}>{name}</span>
                </div>
              ))}
            </div>

            {/* Floating delivery badge */}
            <div
              className="absolute top-8 right-2"
              style={{
                background: "rgba(59,130,246,0.14)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: "1rem",
                padding: "0.7rem 1.1rem",
                display: "flex", alignItems: "center", gap: "0.6rem",
                animation: "floatBadge 4s ease-in-out infinite",
                zIndex: 3,
              }}
            >
              <Truck style={{ width: 18, height: 18, color: "#60a5fa" }} />
              <div>
                <div style={{ color: "#93c5fd", fontSize: "0.75rem", fontWeight: 800 }}>{hp.heroBadgeText}</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem" }}>{hp.heroBadgeSubtext}</div>
              </div>
            </div>

            {/* "Pedido en camino" status chip */}
            <div
              className="absolute bottom-12 left-4"
              style={{
                background: "rgba(34,197,94,0.12)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: "1rem",
                padding: "0.7rem 1.1rem",
                display: "flex", alignItems: "center", gap: "0.6rem",
                animation: "floatBadge 5s ease-in-out 2s infinite",
                zIndex: 3,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(34,197,94,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1rem",
              }}>✅</div>
              <div>
                <div style={{ color: "#86efac", fontSize: "0.75rem", fontWeight: 800 }}>Pedido en camino</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem" }}>Llegando en ~15 min</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wave */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="var(--color-background)" />
        </svg>
      </div>
    </section>
  );
}
