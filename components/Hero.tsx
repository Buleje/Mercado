"use client";

import Link from "next/link";
import { ShoppingCart, MessageCircle, ArrowRight, Truck, Star } from "lucide-react";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden" style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes floatA {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33%      { transform: translateY(-12px) rotate(0.3deg); }
          66%      { transform: translateY(-6px) rotate(-0.3deg); }
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
        @keyframes floatBadge {
          0%,100% { transform: translateY(0) rotate(-2deg); }
          50%     { transform: translateY(-8px) rotate(2deg); }
        }
      `}</style>

      {/* Deep background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(155deg, #1e1b4b 0%, #312e81 12%, #4c1d95 30%, #5b21b6 50%, #4c1d95 70%, #1e1b4b 100%)",
      }} aria-hidden="true" />

      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: "grain 8s steps(10) infinite",
      }} aria-hidden="true" />

      {/* Aurora glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div style={{
          position: "absolute", top: "-30%", right: "-20%",
          width: "75vw", height: "75vw",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, rgba(79,70,229,0.08) 40%, transparent 65%)",
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
        <div style={{
          position: "absolute", top: "20%", left: "50%",
          width: "30vw", height: "30vw",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 65%)",
          filter: "blur(60px)",
          animation: "floatA 16s ease-in-out infinite",
        }} />
      </div>

      {/* Fine dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 0.5px, transparent 0.5px)",
        backgroundSize: "32px 32px",
        opacity: 0.12,
      }} aria-hidden="true" />

      {/* Floating delivery badge */}
      <div
        className="hidden md:flex absolute top-36 right-[8%] z-20 items-center gap-2.5 rounded-2xl px-5 py-3 border border-blue-400/20"
        style={{
          background: "rgba(59,130,246,0.12)",
          backdropFilter: "blur(16px)",
          animation: "floatBadge 4s ease-in-out infinite",
        }}
      >
        <Truck style={{ width: 20, height: 20, color: "#60a5fa" }} />
        <div>
          <span className="block text-sm font-extrabold text-blue-300">Delivery GRATIS</span>
          <span className="text-[11px] text-white/50">Compras desde S/50</span>
        </div>
      </div>

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
          border: "1px solid rgba(96,165,250,0.3)",
          background: "rgba(59,130,246,0.08)", backdropFilter: "blur(16px)",
          padding: "0.4rem 1.2rem", marginBottom: "1.75rem",
        }}>
          <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#3b82f6", animation: "liveRing 2.2s ease-out infinite" }} />
            <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", display: "block" }} />
          </span>
          <span style={{ color: "#93c5fd", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em" }}>Abierto ahora</span>
          <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)" }} />
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }}>Pucallpa, Ucayali</span>
        </div>

        {/* Heading — conversion-focused */}
        <h1 className="animate-[fadeDown_0.5s_ease-out_0.1s_both]" style={{
          fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
          fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.035em",
          color: "#fff", marginBottom: "1.5rem",
        }}>
          Tus abarrotes{" "}
          <span style={{
            background: "linear-gradient(130deg, #818cf8 0%, #60a5fa 40%, #fbbf24 70%, #818cf8 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            backgroundSize: "200% auto",
            animation: "gradientShift 5s linear infinite",
          }}>en tu puerta</span>
          <br />en menos de 30 min
        </h1>

        {/* Subtitle — benefit-focused */}
        <p className="animate-[fadeDown_0.5s_ease-out_0.2s_both]" style={{
          fontSize: "clamp(1.05rem, 2.2vw, 1.2rem)", color: "rgba(255,255,255,0.55)",
          maxWidth: "38rem", marginBottom: "2.5rem", lineHeight: 1.75,
          marginInline: "auto",
        }}>
          +500 productos · Paga con <strong style={{ color: "rgba(255,255,255,0.9)" }}>Yape o efectivo</strong> · Delivery gratis desde S/50.{" "}
          <strong style={{ color: "rgba(255,255,255,0.9)" }}>¡Haz tu pedido ahora!</strong>
        </p>

        {/* CTAs — bigger, more prominent */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.3s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "3rem", justifyContent: "center" }}>
          <Link
            href="/tienda"
            onClick={() => trackCTAClick({ source: "hero", destination: "/tienda", ctaText: "Explorar Tienda" })}
            className="group"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.7rem",
              borderRadius: "1rem", padding: "1.1rem 2.5rem",
              fontSize: "1rem", fontWeight: 800, color: "#fff",
              background: "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)",
              boxShadow: "0 8px 32px -4px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
              transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", textDecoration: "none",
            }}
          >
            <ShoppingCart style={{ width: 20, height: 20 }} />
            Explorar Tienda
            <ArrowRight style={{ width: 16, height: 16, transition: "transform 0.2s" }} className="group-hover:translate-x-0.5" />
          </Link>
          <a
            href="https://wa.me/51916409675?text=Hola%2C%20quiero%20hacer%20un%20pedido"
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
            Pedir por WhatsApp
          </a>
        </div>

        {/* Trust row — compact social proof */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.4s_both]" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ display: "flex", gap: "2px" }}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} style={{ width: 14, height: 14, fill: "#fbbf24", color: "#fbbf24" }} />
              ))}
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", fontWeight: 600 }}>4.8/5</span>
          </div>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", fontWeight: 500 }}>+800 clientes satisfechos</span>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} className="hidden sm:block" />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", fontWeight: 500 }} className="hidden sm:block">Lun–Sáb 7am–9pm</span>
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
