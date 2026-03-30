"use client";

import { useEffect, useState, startTransition, useMemo } from "react";
import Link from "next/link";
import { ShoppingCart, MessageCircle, ArrowRight, Truck, Star, Zap, Package, Clock } from "lucide-react";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";
import { useSettings } from "@/contexts/settings-context";
import { useStoreProducts } from "@/hooks/use-store-products";

function computeGreeting() {
  const h = new Date().getHours();
  const m = new Date().getMonth();
  const seasonal = m === 11 || m === 0 ? " 🎄" : m >= 6 && m <= 8 ? " 🧣" : "";
  if (h >= 5 && h < 12) return `Buenos días${seasonal}`;
  if (h >= 12 && h < 18) return `Buenas tardes${seasonal}`;
  return `Buenas noches${seasonal}`;
}

/** Mapa de emojis y colores para categorías conocidas (fallback a genérico). */
const CATEGORY_STYLE: Record<string, { emoji: string; color: string; bg: string }> = {
  carnes:     { emoji: "🥩", color: "#fca5a5", bg: "rgba(252,165,165,0.08)" },
  verduras:   { emoji: "🥦", color: "#86efac", bg: "rgba(134,239,172,0.08)" },
  frutas:     { emoji: "🍎", color: "#fcd34d", bg: "rgba(252,211,77,0.08)"  },
  lácteos:    { emoji: "🥛", color: "#93c5fd", bg: "rgba(147,197,253,0.08)" },
  lacteos:    { emoji: "🥛", color: "#93c5fd", bg: "rgba(147,197,253,0.08)" },
  panadería:  { emoji: "🍞", color: "#fdba74", bg: "rgba(253,186,116,0.08)" },
  panaderia:  { emoji: "🍞", color: "#fdba74", bg: "rgba(253,186,116,0.08)" },
  bebidas:    { emoji: "🧃", color: "#a5f3fc", bg: "rgba(165,243,252,0.08)" },
  limpieza:   { emoji: "🧹", color: "#c4b5fd", bg: "rgba(196,181,253,0.08)" },
  snacks:     { emoji: "🍿", color: "#fda4af", bg: "rgba(253,164,175,0.08)" },
  huevos:     { emoji: "🥚", color: "#fde68a", bg: "rgba(253,230,138,0.08)" },
  abarrotes:  { emoji: "🛒", color: "#86efac", bg: "rgba(134,239,172,0.08)" },
  embutidos:  { emoji: "🌭", color: "#fca5a5", bg: "rgba(252,165,165,0.08)" },
  congelados: { emoji: "🧊", color: "#93c5fd", bg: "rgba(147,197,253,0.08)" },
  higiene:    { emoji: "🧴", color: "#c4b5fd", bg: "rgba(196,181,253,0.08)" },
  mascotas:   { emoji: "🐾", color: "#fcd34d", bg: "rgba(252,211,77,0.08)"  },
};

function getCategoryStyle(label: string) {
  const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CATEGORY_STYLE[key] ?? { emoji: "📦", color: "#86efac", bg: "rgba(134,239,172,0.08)" };
}

export default function Hero() {
  const { homepage: hp, deliveryConfig, storeTheme } = useSettings();
  const { categories } = useStoreProducts();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    startTransition(() => setGreeting(computeGreeting()));
  }, []);

  // Categorías reales del tenant (excluir "todos"), máx 9 para mantener la grid 3×3
  const displayCategories = useMemo(
    () => categories.filter((c) => c.id !== "todos").slice(0, 9),
    [categories]
  );
  const hasCategories = displayCategories.length > 0;

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
          60%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes floatA {
          0%,100% { transform: translateY(0px) rotate(-1.5deg); }
          50%     { transform: translateY(-10px) rotate(1.5deg); }
        }
        @keyframes floatB {
          0%,100% { transform: translateY(0px) rotate(1deg); }
          50%     { transform: translateY(-7px) rotate(-1deg); }
        }
        @keyframes chipIn {
          from { opacity:0; transform:translateY(14px) scale(0.88); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes fadeDown {
          from { opacity:0; transform:translateY(-14px); }
          to   { opacity:1; transform:none; }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:none; }
        }
        @keyframes shimmerSlide {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(100%); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes slowZoom {
          from { transform: scale(1); }
          to   { transform: scale(1.08); }
        }
        @keyframes heroParticle {
          0%   { transform: translateY(0) translateX(0) scale(0); opacity: 0; }
          20%  { opacity: 0.6; transform: scale(1); }
          100% { transform: translateY(-120px) translateX(40px) scale(0); opacity: 0; }
        }
        .hero-bg-animated {
          background: linear-gradient(270deg, #0f766e, #1a4731, #14b8a6, #0f766e, #f97316, #0f766e);
          background-size: 600% 600%;
          animation: gradientShift 12s ease infinite;
        }
        .hero-stat-chip { animation: chipIn 0.55s cubic-bezier(0.175,0.885,0.32,1.275) both; }
        .hero-cta-primary:hover { transform:translateY(-2px); box-shadow: 0 12px 40px -6px rgba(45,106,79,0.65), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.18) !important; }
        .hero-cta-secondary:hover { background: rgba(240,244,241,0.1) !important; border-color: rgba(240,244,241,0.3) !important; }
        .cat-card:hover { border-color: rgba(45,106,79,0.4) !important; background: rgba(45,106,79,0.1) !important; transform: translateY(-2px); }
      `}</style>

      {/* ── Background: animated gradient simulating video ── */}
      <div className="absolute inset-0 hero-bg-animated" aria-hidden="true" style={{ opacity: 0.35 }} />
      <div className="absolute inset-0" style={{
        background: "linear-gradient(155deg, #030a05 0%, #060e08 20%, #0a1a0e 45%, #0d1f11 65%, #060e08 85%, #030a05 100%)",
        opacity: 0.85,
      }} aria-hidden="true" />

      {/* ── Ambient glow blobs with slow zoom ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" style={{ animation: "slowZoom 20s ease-in-out infinite alternate" }}>
        {/* Primary green glow — top-right */}
        <div style={{
          position: "absolute", top: "-15%", right: "-10%",
          width: "70vw", height: "70vw",
          background: "radial-gradient(ellipse, rgba(45,106,79,0.25) 0%, rgba(45,106,79,0.06) 45%, transparent 70%)",
          filter: "blur(90px)",
        }} />
        {/* Amber glow — bottom-left */}
        <div style={{
          position: "absolute", bottom: "-20%", left: "-5%",
          width: "55vw", height: "55vw",
          background: "radial-gradient(ellipse, rgba(244,162,97,0.16) 0%, rgba(244,162,97,0.03) 45%, transparent 70%)",
          filter: "blur(100px)",
        }} />
        {/* Subtle center highlight */}
        <div style={{
          position: "absolute", top: "30%", left: "45%",
          width: "30vw", height: "30vw",
          background: "radial-gradient(ellipse, rgba(45,106,79,0.1) 0%, transparent 65%)",
          filter: "blur(60px)",
        }} />
      </div>

      {/* ── Dot grid texture with depth overlay ── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, rgba(45,106,79,0.35) 0.5px, transparent 0.5px)",
        backgroundSize: "32px 32px",
        opacity: 0.15,
      }} aria-hidden="true" />
      {/* ── Diagonal line pattern for depth ── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(135deg, rgba(45,106,79,0.04) 0px, rgba(45,106,79,0.04) 1px, transparent 1px, transparent 24px)",
        opacity: 0.6,
      }} aria-hidden="true" />

      {/* ── Floating particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            bottom: `${10 + i * 14}%`,
            left: `${8 + i * 15}%`,
            width: 4 + (i % 3) * 2,
            height: 4 + (i % 3) * 2,
            borderRadius: "50%",
            background: i % 2 === 0 ? "rgba(45,106,79,0.4)" : "rgba(244,162,97,0.3)",
            animation: `heroParticle ${5 + i * 1.5}s ease-in-out ${i * 0.8}s infinite`,
          }} />
        ))}
      </div>

      {/* ═══════════════════════════════════════════
          MAIN LAYOUT
      ═══════════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-28 md:py-0"
        style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center w-full">

          {/* ── LEFT: Text content ── */}
          <div className="flex flex-col text-center lg:text-left">

            {/* Store status pill */}
            <div className="animate-[fadeDown_0.45s_ease-out_both] self-center lg:self-start" style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              borderRadius: "9999px",
              border: `1px solid ${mounted && storeStatus.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              background: mounted && storeStatus.open ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
              backdropFilter: "blur(16px)",
              padding: "0.375rem 1.1rem", marginBottom: "1.5rem",
            }}>
              <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: mounted && storeStatus.open ? "#22c55e" : "#ef4444", animation: mounted && storeStatus.open ? "liveRing 2.2s ease-out infinite" : "none" }} />
                <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: mounted && storeStatus.open ? "#22c55e" : "#ef4444", display: "block" }} />
              </span>
              <span style={{ color: mounted && storeStatus.open ? "#86efac" : "#fca5a5", fontSize: "0.75rem", fontWeight: 700 }}>{mounted ? storeStatus.label : ""}</span>
              <span style={{ width: 1, height: 12, background: "rgba(240,244,241,0.15)" }} />
              <span style={{ color: "rgba(240,244,241,0.45)", fontSize: "0.72rem" }}>Pucallpa, Ucayali</span>
            </div>

            {/* Greeting */}
            {hp.heroGreetingEnabled && greeting && (
              <p className="animate-[fadeDown_0.4s_ease-out_both]" style={{
                fontSize: "clamp(0.9rem,1.6vw,1.05rem)",
                color: "rgba(240,244,241,0.55)", fontWeight: 600, marginBottom: "0.5rem",
              }}>
                {greeting} 👋
              </p>
            )}

            {/* Main heading */}
            <h1 className="animate-[fadeDown_0.5s_ease-out_0.1s_both]" style={{
              fontSize: "clamp(2.6rem,5.2vw,4rem)",
              fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.035em",
              color: "#f0f4f1", marginBottom: "1.5rem",
              textShadow: "0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(45,106,79,0.2)",
            }}>
              {storeTheme?.heroTitle || hp.heroTitle}{" "}
              <span style={{
                background: "linear-gradient(130deg, #4ade80 0%, #0f766e 40%, #f97316 75%, #f97316 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text", display: "inline-block",
              }}>{hp.heroTitleAccent}</span>
              <br />
              <span style={{ color: "rgba(240,244,241,0.6)", fontSize: "78%" }}>en menos de 30 min</span>
            </h1>

            {/* Subtitle */}
            <p className="animate-[fadeDown_0.5s_ease-out_0.2s_both]" style={{
              fontSize: "clamp(0.95rem,1.7vw,1.1rem)", color: "rgba(240,244,241,0.52)",
              marginBottom: "2.2rem", lineHeight: 1.78, maxWidth: "36rem",
            }}>
              {storeTheme?.heroSubtitle || hp.heroSubtitle}
            </p>

            {/* CTA row */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.3s_both]" style={{
              display: "flex", flexWrap: "wrap", gap: "0.875rem",
              marginBottom: "2.5rem", justifyContent: "center",
            }}>
              <Link
                href={storeTheme?.heroLink ? `/${storeTheme.heroLink}` : hp.heroCta1Link}
                onClick={() => trackCTAClick({ source: "hero", destination: storeTheme?.heroLink ? `/${storeTheme.heroLink}` : hp.heroCta1Link, ctaText: storeTheme?.heroCTA || hp.heroCta1Text })}
                className="hero-cta-primary group relative overflow-hidden"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.65rem",
                  borderRadius: "0.9rem", padding: "1rem 2.2rem",
                  fontSize: "1rem", fontWeight: 800, color: "#fff",
                  background: "linear-gradient(135deg, #0f766e 0%, #0d5f58 100%)",
                  boxShadow: "0 8px 32px -4px rgba(45,106,79,0.55), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
                  transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
                }}
              >
                {/* Shimmer sweep */}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.14) 50%, transparent 65%)", animation: "shimmerSlide 1s ease-in-out" }}
                />
                <ShoppingCart style={{ width: 19, height: 19, position: "relative", zIndex: 1 }} />
                <span style={{ position: "relative", zIndex: 1 }}>{storeTheme?.heroCTA || hp.heroCta1Text}</span>
                <ArrowRight style={{ width: 15, height: 15, position: "relative", zIndex: 1 }} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href={hp.heroCta2Link}
                onClick={() => trackWhatsAppClick("hero")}
                target="_blank" rel="noopener noreferrer"
                className="hero-cta-secondary"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.6rem",
                  borderRadius: "0.9rem", padding: "1rem 2.2rem",
                  fontSize: "1rem", fontWeight: 700, color: "#f0f4f1",
                  background: "rgba(240,244,241,0.05)", backdropFilter: "blur(16px)",
                  border: "1px solid rgba(240,244,241,0.14)",
                  transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
                }}
              >
                <MessageCircle style={{ width: 19, height: 19 }} />
                {hp.heroCta2Text}
              </a>
            </div>

            {/* Social proof chips */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.4s_both]" style={{
              display: "flex", flexWrap: "wrap", gap: "0.625rem",
              justifyContent: "center",
            }}>
              {[
                { icon: Star, value: "4.8★", label: "Valoración", color: "#f97316", delay: "0.45s" },
                { icon: Package, value: "+800", label: "Clientes", color: "#4ade80", delay: "0.55s" },
                { icon: Clock, value: "~30min", label: "Delivery", color: "#60a5fa", delay: "0.65s" },
                { icon: Zap, value: "24/7", label: "Soporte", color: "#a78bfa", delay: "0.75s" },
              ].map(({ icon: Icon, value, label, color, delay }) => (
                <div key={label} className="hero-stat-chip" style={{
                  animationDelay: delay,
                  display: "flex", alignItems: "center", gap: "0.45rem",
                  padding: "0.5rem 0.9rem", borderRadius: "0.7rem",
                  background: "rgba(240,244,241,0.04)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(240,244,241,0.09)",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: color + "18",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon style={{ width: 12, height: 12, color }} />
                  </div>
                  <div>
                    <div style={{ color: "#f0f4f1", fontSize: "0.78rem", fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
                    <div style={{ color: "rgba(240,244,241,0.4)", fontSize: "0.62rem", fontWeight: 500 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── MOBILE: Category carousel (visible < lg) ── */}
          {hasCategories && (
            <div className="lg:hidden animate-[fadeDown_0.5s_ease-out_0.5s_both]" style={{ marginTop: "1.5rem" }}>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-2 -mx-2 px-2" style={{ scrollSnapType: "x mandatory" }}>
                {displayCategories.map(({ id, label }) => {
                  const style = getCategoryStyle(label);
                  return (
                    <Link key={id} href={`/tienda?category=${id}`}
                      className="cat-card shrink-0"
                      style={{
                        scrollSnapAlign: "start",
                        background: "rgba(45,106,79,0.06)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(45,106,79,0.15)",
                        borderRadius: "0.9rem",
                        padding: "0.75rem 1rem",
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        textDecoration: "none",
                        transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                      }}
                    >
                      <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{style.emoji}</span>
                      <span style={{ color: style.color, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── RIGHT: Category showcase ── */}
          <div className="hidden lg:flex flex-col items-center justify-center relative" style={{ minHeight: 520 }}>

            {/* Glow behind grid */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 50% 50%, rgba(45,106,79,0.12) 0%, transparent 70%)",
              filter: "blur(40px)",
            }} aria-hidden="true" />

            {/* Category grid — solo si hay categorías reales */}
            {hasCategories && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.8rem", width: 380, position: "relative", zIndex: 2 }}>
                {displayCategories.map(({ id, label }, i) => {
                  const style = getCategoryStyle(label);
                  return (
                    <div key={id} className="cat-card" style={{
                      background: style.bg,
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(45,106,79,0.15)",
                      borderRadius: "1.1rem",
                      padding: "1.2rem 0.5rem",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "0.45rem",
                      userSelect: "none", cursor: "default",
                      transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                      animationDelay: `${i * 0.05}s`,
                    }}>
                      <span style={{ fontSize: "2rem", lineHeight: 1 }}>{style.emoji}</span>
                      <span style={{ color: style.color, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Floating delivery badge */}
            <div className="absolute top-6 right-0" style={{
              background: "rgba(45,106,79,0.12)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(45,106,79,0.28)",
              borderRadius: "1rem",
              padding: "0.65rem 1rem",
              display: "flex", alignItems: "center", gap: "0.55rem",
              animation: "floatA 4.5s ease-in-out infinite",
              zIndex: 3,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(45,106,79,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Truck style={{ width: 16, height: 16, color: "#4ade80" }} />
              </div>
              <div>
                <div style={{ color: "#86efac", fontSize: "0.73rem", fontWeight: 800 }}>{hp.heroBadgeText}</div>
                <div style={{ color: "rgba(240,244,241,0.4)", fontSize: "0.62rem" }}>{hp.heroBadgeSubtext}</div>
              </div>
            </div>

            {/* "Pedido en camino" chip */}
            <div className="absolute bottom-10 left-2" style={{
              background: "rgba(244,162,97,0.1)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(244,162,97,0.25)",
              borderRadius: "1rem",
              padding: "0.65rem 1rem",
              display: "flex", alignItems: "center", gap: "0.55rem",
              animation: "floatB 5s ease-in-out 1.5s infinite",
              zIndex: 3,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(244,162,97,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1rem",
              }}>✅</div>
              <div>
                <div style={{ color: "#fcd34d", fontSize: "0.73rem", fontWeight: 800 }}>Pedido en camino</div>
                <div style={{ color: "rgba(240,244,241,0.4)", fontSize: "0.62rem" }}>Llegando en ~15 min</div>
              </div>
            </div>

            {/* Subtle corner decorations */}
            <div style={{
              position: "absolute", bottom: "28%", right: "2%",
              width: 60, height: 60, borderRadius: "50%",
              background: "rgba(45,106,79,0.06)",
              border: "1px solid rgba(45,106,79,0.12)",
              zIndex: 1,
            }} aria-hidden="true" />
            <div style={{
              position: "absolute", top: "20%", left: "3%",
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(244,162,97,0.05)",
              border: "1px solid rgba(244,162,97,0.1)",
              zIndex: 1,
            }} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Wave transition */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="var(--color-background)" />
        </svg>
      </div>
    </section>
  );
}
