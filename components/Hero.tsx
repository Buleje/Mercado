"use client";

import { ShoppingCart, MapPin, Clock, Truck, MessageCircle, ArrowRight } from "lucide-react";

const STATS = [
  { value: "+800", label: "Clientes felices", color: "#4ade80" },
  { value: "4.8★", label: "Calificación", color: "#fbbf24" },
  { value: "~30min", label: "Delivery", color: "#22d3ee" },
];

const FEATURED_CATEGORIES = [
  { emoji: "🥬", name: "Frutas y Verduras", color: "rgba(74,222,128,0.15)" },
  { emoji: "🥩", name: "Carnes", color: "rgba(248,113,113,0.15)" },
  { emoji: "🥤", name: "Bebidas", color: "rgba(96,165,250,0.15)" },
  { emoji: "🏪", name: "Abarrotes", color: "rgba(251,191,36,0.15)" },
];

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden" style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes floatA {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33%      { transform: translateY(-12px) rotate(0.3deg); }
          66%      { transform: translateY(-6px) rotate(-0.3deg); }
        }
        @keyframes floatB {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-16px); }
        }
        @keyframes liveRing {
          0%   { transform: scale(1); opacity: 0.9; }
          60%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes auroraA {
          0%,100% { opacity: 1;   transform: scale(1) translate(0,0); }
          50%      { opacity: 0.5; transform: scale(1.2) translate(3%, -4%); }
        }
        @keyframes auroraB {
          0%,100% { opacity: 0.7; transform: scale(1) translate(0,0); }
          50%      { opacity: 1;   transform: scale(0.85) translate(-5%, 5%); }
        }
        @keyframes grain { 0%,100% { transform:translate(0,0) } 10% { transform:translate(-5%,-10%) } 30% { transform:translate(3%,2%) } 50% { transform:translate(-7%,5%) } 70% { transform:translate(8%,1%) } 90% { transform:translate(-3%,7%) } }
      `}</style>

      {/* Deep background with richer gradient */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(155deg, #020b05 0%, #071a0f 12%, #0d2b19 30%, #123626 50%, #0d2b19 70%, #050e08 100%)",
      }} aria-hidden="true" />

      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: "grain 8s steps(10) infinite",
      }} aria-hidden="true" />

      {/* Aurora glows - more vibrant */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div style={{
          position: "absolute", top: "-30%", right: "-20%",
          width: "75vw", height: "75vw",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.25) 0%, rgba(16,185,129,0.08) 40%, transparent 65%)",
          filter: "blur(80px)",
          animation: "auroraA 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-25%", left: "-10%",
          width: "60vw", height: "60vw",
          background: "radial-gradient(ellipse, rgba(251,191,36,0.16) 0%, rgba(245,158,11,0.05) 40%, transparent 65%)",
          filter: "blur(100px)",
          animation: "auroraB 18s ease-in-out infinite",
        }} />
        {/* Accent glow - cyan */}
        <div style={{
          position: "absolute", top: "20%", left: "50%",
          width: "30vw", height: "30vw",
          background: "radial-gradient(ellipse, rgba(34,211,238,0.08) 0%, transparent 65%)",
          filter: "blur(60px)",
          animation: "floatA 16s ease-in-out infinite",
        }} />
      </div>

      {/* Fine dot grid - tighter */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 0.5px, transparent 0.5px)",
        backgroundSize: "32px 32px",
        opacity: 0.12,
      }} aria-hidden="true" />

      {/* Content */}
      <div className="relative w-full" style={{
        zIndex: 10, maxWidth: "60rem", marginInline: "auto",
        paddingInline: "1.5rem", paddingTop: "11rem", paddingBottom: "6rem",
        textAlign: "center",
      }}>
        {/* Live badge */}
        <div className="animate-[fadeDown_0.5s_ease-out]" style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          borderRadius: "9999px",
          border: "1px solid rgba(74,222,128,0.3)",
          background: "rgba(74,222,128,0.08)", backdropFilter: "blur(16px)",
          padding: "0.4rem 1.2rem", marginBottom: "1.75rem",
        }}>
          <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "liveRing 2.2s ease-out infinite" }} />
            <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "block" }} />
          </span>
          <span style={{ color: "#86efac", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em" }}>Abierto ahora</span>
          <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)" }} />
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }}>Delivery gratis en Pucallpa</span>
        </div>

        {/* Heading - tighter line height, bolder */}
        <h1 className="animate-[fadeDown_0.5s_ease-out_0.1s_both]" style={{
          fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
          fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.035em",
          color: "#fff", marginBottom: "1.5rem",
        }}>
          Tu bodega de{" "}
          <span style={{
            background: "linear-gradient(130deg, #4ade80 0%, #22d3ee 50%, #fbbf24 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>confianza</span>
          <br />en Pucallpa
        </h1>

        {/* Subtitle - cleaner */}
        <p className="animate-[fadeDown_0.5s_ease-out_0.2s_both]" style={{
          fontSize: "clamp(1.05rem, 2.2vw, 1.2rem)", color: "rgba(255,255,255,0.55)",
          maxWidth: "36rem", marginBottom: "2.25rem", lineHeight: 1.75,
          marginInline: "auto",
        }}>
          Abarrotes, carnes, bebidas y más — pedidos al instante.{" "}
          <strong style={{ color: "rgba(255,255,255,0.9)" }}>Paga con Yape o efectivo.</strong>
        </p>

        {/* CTAs - more polished */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.3s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "0.875rem", marginBottom: "3rem", justifyContent: "center" }}>
          <a
            href="#productos"
            onClick={(e) => { e.preventDefault(); document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" }); }}
            className="group"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.6rem",
              borderRadius: "0.875rem", padding: "1rem 2rem",
              fontSize: "0.9rem", fontWeight: 800, color: "#052a14",
              background: "linear-gradient(135deg, #6ee7a0 0%, #22c55e 50%, #16a34a 100%)",
              boxShadow: "0 8px 32px -4px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
              transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
            }}
          >
            <ShoppingCart style={{ width: 18, height: 18 }} />
            Ver Productos
            <ArrowRight style={{ width: 15, height: 15, transition: "transform 0.2s" }} className="group-hover:translate-x-0.5" />
          </a>
          <a
            href="https://wa.me/51916409675?text=Hola%2C%20quiero%20hacer%20un%20pedido"
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.6rem",
              borderRadius: "0.875rem", padding: "1rem 2rem",
              fontSize: "0.9rem", fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.15)",
              transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
            }}
          >
            <MessageCircle style={{ width: 18, height: 18 }} />
            Pedir por WhatsApp
          </a>
        </div>

        {/* Stats - cleaner with color accents */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.4s_both]" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
          {STATS.map((s, i) => (
            <div key={s.value} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              paddingLeft: i > 0 ? 24 : 0,
              paddingRight: i < STATS.length - 1 ? 24 : 0,
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
            }}>
              <span style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 900, color: s.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
              <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)", marginTop: 6, fontWeight: 500, letterSpacing: "0.04em" }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Featured Categories - new section */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.5s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "2.75rem", justifyContent: "center" }}>
          {FEATURED_CATEGORIES.map(({ emoji, name, color }) => (
            <button
              key={name}
              onClick={() => {
                document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                backdropFilter: "blur(12px)", borderRadius: "0.75rem",
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "0.55rem 1rem", background: color,
                transition: "all 0.2s", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "1rem" }}>{emoji}</span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.75rem", fontWeight: 600 }}>{name}</span>
            </button>
          ))}
        </div>

        {/* Info pills */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.6s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.5rem", justifyContent: "center" }}>
          {[
            { Icon: MapPin, text: "Pucallpa, Ucayali" },
            { Icon: Clock,  text: "Lun\u2013S\u00e1b 7am\u20139pm" },
            { Icon: Truck,  text: "Delivery gratis +S/50" },
          ].map(({ Icon, text }) => (
            <div key={text} style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              borderRadius: "9999px",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "0.4rem 0.85rem", background: "rgba(255,255,255,0.04)",
            }}>
              <Icon style={{ width: 12, height: 12, flexShrink: 0, color: "var(--color-secondary)", opacity: 0.8 }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem", fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wave - smoother */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="var(--color-background)" />
        </svg>
      </div>
    </section>
  );
}
