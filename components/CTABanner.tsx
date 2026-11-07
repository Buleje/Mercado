"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Truck, ShieldCheck, Clock, CreditCard, Flame } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";
import MorphingBlob from "@/components/ui/MorphingBlob";
import { useMagnetic } from "@/hooks/use-magnetic";
import { useRipple } from "@/hooks/use-ripple";

const PERKS = [
  { icon: Truck, label: "Delivery gratis +S/50", color: "#4ade80" },
  { icon: Clock, label: "Entrega en ~30 min", color: "#60a5fa" },
  { icon: CreditCard, label: "Paga con Yape o efectivo", color: "#ff6b5b" },
  { icon: ShieldCheck, label: "Calidad garantizada", color: "#86efac" },
];

function getDailyOrderCount() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const base = 32 + (seed % 28);
  const hourBonus = Math.min(today.getHours(), 12);
  return base + hourBonus;
}

export default function CTABanner() {
  const [ref, inView] = useInView({ threshold: 0.15 });
  const orderCount = useMemo(() => getDailyOrderCount(), []);
  const { magnetRef, onMagnetMove, onMagnetLeave } = useMagnetic(0.25);
  const createRipple = useRipple("rgba(255,255,255,0.3)");

  return (
    <section
      ref={ref}
      className="relative py-20 sm:py-28 overflow-hidden"
      style={{
        background: "linear-gradient(155deg, #030a05 0%, #071410 25%, #0d2218 50%, #071410 80%, #030a05 100%)",
      }}
    >
      {/* Morphing blobs — organic movement */}
      <MorphingBlob
        color1="rgba(45,106,79,0.35)"
        color2="rgba(244,162,97,0.12)"
        size="55vw"
        speed={14}
        className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      <MorphingBlob
        color1="rgba(244,162,97,0.18)"
        color2="rgba(45,106,79,0.04)"
        size="35vw"
        speed={18}
        className="top-0 right-0"
      />
      <MorphingBlob
        color1="rgba(45,106,79,0.15)"
        color2="transparent"
        size="28vw"
        speed={22}
        className="bottom-0 left-0"
      />

      {/* Dot grid texture */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.2) 0.5px, transparent 0.5px)",
        backgroundSize: "40px 40px",
        opacity: 0.07,
      }} />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-5 rounded-full px-4 py-1.5 border border-amber-400/20 bg-amber-400/10 text-amber-300/90">
            <Flame className="h-3.5 w-3.5 animate-pulse" />
            {orderCount > 0 ? <span>{orderCount} pedidos hoy</span> : <span>Alta demanda</span>}
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-black text-white leading-[1.1] mb-5">
            No te quedes{" "}
            <br className="hidden sm:block" />
            <span style={{
              background: "linear-gradient(130deg, #4ade80 0%, var(--accent) 40%, #ff6b5b 75%, #ff6b5b 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              display: "inline-block",
            }}>
              sin tus productos favoritos
            </span>
          </h2>

          <p className="text-white/50 text-base sm:text-lg max-w-2xl mx-auto mb-4 leading-relaxed">
            Explora nuestro catálogo completo con más de 500 productos. Haz tu pedido en minutos y recíbelo en la puerta de tu casa.
          </p>

          <p className="text-amber-300/70 text-sm font-semibold mb-10">
            ⚡ Los productos populares se agotan rápido — ¡Asegura tu pedido!
          </p>

          {/* CTA Buttons — magnetic + ripple */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <Link
              ref={magnetRef as React.Ref<HTMLAnchorElement>}
              href="/tienda"
              aria-label="Ir a la tienda — explorar catálogo completo"
              onClick={(e) => {
                createRipple(e as React.MouseEvent<HTMLElement>);
                trackCTAClick({ source: "cta-banner", destination: "/tienda", ctaText: "Ir a la tienda" });
              }}
              onMouseMove={onMagnetMove as React.MouseEventHandler<HTMLAnchorElement>}
              onMouseLeave={onMagnetLeave}
              className="group relative inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-base font-extrabold text-white overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
                boxShadow: "0 8px 32px -4px rgba(45,106,79,0.6), inset 0 1px 0 rgba(255,255,255,0.18)",
              }}
            >
              <span className="relative z-10 flex items-center gap-3">
                Ir a la tienda
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
            <a
              href="https://wa.me/51929340532?text=Hola%2C%20quiero%20hacer%20un%20pedido"
              onClick={() => trackWhatsAppClick("cta-banner")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pedir por WhatsApp — abre conversación en WhatsApp"
              className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-bold text-white border border-white/15 bg-white/8 backdrop-blur-sm hover:bg-white/14 hover:-translate-y-0.5 transition-all duration-300"
            >
              💬 Pedir por WhatsApp
            </a>
          </div>

          {/* Perks — glassmorphism chips */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {PERKS.map((perk, i) => (
              <div
                key={perk.label}
                className="flex flex-col items-center gap-2.5 rounded-2xl p-4 border border-white/8"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div
                  className="flex items-center justify-center h-12 w-12 rounded-xl"
                  style={{ background: perk.color + "20", boxShadow: `0 4px 12px ${perk.color}30` }}
                >
                  <perk.icon className="h-5 w-5" style={{ color: perk.color }} />
                </div>
                <span className="text-white/70 text-xs sm:text-sm font-medium text-center leading-snug">
                  {perk.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
