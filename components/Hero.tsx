"use client";

import { ShoppingCart, MapPin, Clock, Truck, MessageCircle, ArrowRight } from "lucide-react";

const STATS = [
  { value: "+800", label: "Clientes felices" },
  { value: "4.8★", label: "Calificación" },
  { value: "~30min", label: "Delivery" },
];

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden" style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes floatA {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33%      { transform: translateY(-10px) rotate(0.4deg); }
          66%      { transform: translateY(-5px) rotate(-0.4deg); }
        }
        @keyframes floatB {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-14px); }
        }
        @keyframes floatC {
          0%,100% { transform: translateY(-7px); }
          50%      { transform: translateY(7px); }
        }
        @keyframes liveRing {
          0%   { transform: scale(1); opacity: 0.9; }
          60%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes auroraA {
          0%,100% { opacity: 1;   transform: scale(1) translate(0,0); }
          50%      { opacity: 0.6; transform: scale(1.15) translate(3%, -4%); }
        }
        @keyframes auroraB {
          0%,100% { opacity: 0.8; transform: scale(1) translate(0,0); }
          50%      { opacity: 1;   transform: scale(0.9) translate(-5%, 5%); }
        }
      `}</style>

      {/* Deep background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(155deg, #040f08 0%, #0a2212 18%, #123626 40%, #0d2b19 65%, #030f07 100%)",
      }} aria-hidden="true" />

      {/* Aurora glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div style={{
          position: "absolute", top: "-25%", right: "-15%",
          width: "72vw", height: "72vw",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.22) 0%, rgba(16,185,129,0.07) 45%, transparent 70%)",
          filter: "blur(70px)",
          animation: "auroraA 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", left: "-8%",
          width: "55vw", height: "55vw",
          background: "radial-gradient(ellipse, rgba(251,191,36,0.14) 0%, rgba(245,158,11,0.05) 45%, transparent 70%)",
          filter: "blur(90px)",
          animation: "auroraB 18s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "35%", left: "30%",
          width: "38vw", height: "38vw",
          background: "radial-gradient(ellipse, rgba(74,222,128,0.07) 0%, transparent 70%)",
          filter: "blur(50px)",
          animation: "floatC 11s ease-in-out infinite",
        }} />
      </div>

      {/* Fine dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
        opacity: 0.18,
      }} aria-hidden="true" />

      {/* Diagonal hatch corner */}
      <svg className="absolute top-0 right-0 pointer-events-none" width="500" height="340" viewBox="0 0 500 340" aria-hidden="true" fill="none" style={{ opacity: 0.04 }}>
        <defs>
          <pattern id="hatch" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M0 28L28 0" stroke="white" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="500" height="340" fill="url(#hatch)" />
      </svg>

      {/* Content */}
      <div className="relative w-full" style={{
        zIndex: 10, maxWidth: "56rem", marginInline: "auto",
        paddingInline: "1.5rem", paddingTop: "13rem", paddingBottom: "7rem",
        textAlign: "center",
      }}>
        <div>
            {/* Live badge */}
            <div className="animate-[fadeDown_0.5s_ease-out]" style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              borderRadius: "9999px",
              border: "1px solid rgba(74,222,128,0.35)",
              background: "rgba(74,222,128,0.09)", backdropFilter: "blur(12px)",
              padding: "0.375rem 1.1rem", marginBottom: "1.75rem",
              marginInline: "auto",
            }}>
              <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "liveRing 2.2s ease-out infinite" }} />
                <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "block" }} />
              </span>
              <span style={{ color: "#86efac", fontSize: "0.75rem", fontWeight: 700 }}>Abierto ahora</span>
              <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.2)" }} />
              <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.75rem" }}>Delivery gratis en Pucallpa</span>
            </div>

            {/* Heading */}
            <h1 className="animate-[fadeDown_0.5s_ease-out_0.1s_both]" style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.025em",
              color: "#fff", marginBottom: "1.25rem",
            }}>
              Tu bodega de{" "}
              <span style={{
                background: "linear-gradient(130deg, #4ade80 0%, #22d3ee 50%, #fbbf24 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>confianza</span>
              <br />en Pucallpa
            </h1>

            {/* Subtitle */}
            <p className="animate-[fadeDown_0.5s_ease-out_0.2s_both]" style={{
              fontSize: "clamp(1rem, 2vw, 1.125rem)", color: "rgba(255,255,255,0.62)",
              maxWidth: "38rem", marginBottom: "2rem", lineHeight: 1.8,
              marginInline: "auto",
            }}>
              Abarrotes, carnes, bebidas y más — pedidos al instante.{" "}
              <strong style={{ color: "rgba(255,255,255,0.92)" }}>Paga con Yape o efectivo.</strong>
            </p>

            {/* CTAs */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.3s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "2.75rem", justifyContent: "center" }}>
              <a
                href="#productos"
                onClick={(e) => { e.preventDefault(); document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.6rem",
                  borderRadius: "1rem", padding: "1.0625rem 1.875rem",
                  fontSize: "0.9rem", fontWeight: 800, color: "#052a14",
                  background: "linear-gradient(135deg, #6ee7a0 0%, #22c55e 50%, #16a34a 100%)",
                  boxShadow: "0 8px 28px -4px rgba(34,197,94,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                  transition: "all 0.2s", textDecoration: "none",
                }}
              >
                <ShoppingCart style={{ width: 18, height: 18 }} />
                Ver Productos
                <ArrowRight style={{ width: 15, height: 15 }} />
              </a>
              <a
                href="https://wa.me/51916409675?text=Hola%2C%20quiero%20hacer%20un%20pedido"
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.6rem",
                  borderRadius: "1rem", padding: "1.0625rem 1.875rem",
                  fontSize: "0.9rem", fontWeight: 700, color: "#fff",
                  background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  transition: "all 0.2s", textDecoration: "none",
                }}
              >
                <MessageCircle style={{ width: 18, height: 18, fill: "rgba(255,255,255,0.75)" }} />
                Pedir por WhatsApp
              </a>
            </div>

            {/* Stats */}
            <div className="animate-[fadeDown_0.5s_ease-out_0.4s_both]" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              {STATS.map((s, i) => (
                <div key={s.value} style={{
                  display: "flex", flexDirection: "column",
                  paddingLeft: i > 0 ? 20 : 0,
                  paddingRight: i < STATS.length - 1 ? 20 : 0,
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.15)" : "none",
                }}>
                  <span style={{ fontSize: "clamp(1.5rem, 3vw, 1.875rem)", fontWeight: 900, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                  <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.42)", marginTop: 6, fontWeight: 500 }}>{s.label}</span>
                </div>
              ))}
            </div>
        </div>

        {/* Info pills — always visible, centered */}
        <div className="animate-[fadeDown_0.5s_ease-out_0.5s_both]" style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", marginTop: "2.5rem", justifyContent: "center" }}>
          {[
            { Icon: MapPin, text: "Pucallpa, Ucayali" },
            { Icon: Clock,  text: "Lun\u2013S\u00e1b 7am\u20139pm" },
            { Icon: Truck,  text: "Delivery gratis +S/50" },
          ].map(({ Icon, text }) => (
            <div key={text} style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              backdropFilter: "blur(8px)", borderRadius: "9999px",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "0.5rem 1rem", background: "rgba(255,255,255,0.07)",
            }}>
              <Icon style={{ width: 14, height: 14, flexShrink: 0, color: "var(--color-secondary)" }} />
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.75rem", fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wave */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 60" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
          <path d="M0,30 C380,60 1060,0 1440,30 L1440,60 L0,60 Z" fill="var(--color-background)" />
        </svg>
      </div>
    </section>
  );
}
