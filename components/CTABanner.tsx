"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Truck, ShieldCheck, Clock, CreditCard, Flame } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";

const PERKS = [
  { icon: Truck, label: "Delivery gratis +S/50", color: "#3b82f6" },
  { icon: Clock, label: "Entrega en ~30 min", color: "#3b82f6" },
  { icon: CreditCard, label: "Paga con Yape o efectivo", color: "#f59e0b" },
  { icon: ShieldCheck, label: "Calidad garantizada", color: "#8b5cf6" },
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

  return (
    <section
      ref={ref}
      className="relative py-20 sm:py-28 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #1e1b4b 0%, #312e81 30%, #4f46e5 60%, #312e81 100%)",
      }}
    >
      {/* Decorative glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[40vw] bg-primary/12 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[30vw] h-[30vw] bg-secondary/8 rounded-full blur-[100px] pointer-events-none" />
      {/* Extra warm glow */}
      <div className="absolute bottom-0 left-0 w-[25vw] h-[25vw] bg-amber-500/6 rounded-full blur-[80px] pointer-events-none" />

      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.25) 0.5px, transparent 0.5px)",
        backgroundSize: "40px 40px",
        opacity: 0.08,
      }} />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-5 rounded-full px-4 py-1.5 border border-amber-400/20 bg-amber-400/10 text-amber-300/90">
            <Flame className="h-3.5 w-3.5" />
            {orderCount > 0 && <span>{orderCount} pedidos hoy</span>}
            {orderCount === 0 && <span>Alta demanda</span>}
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-black text-white leading-[1.1] mb-5">
            No te quedes{" "}
            <br className="hidden sm:block" />
            <span className="bg-linear-to-r from-blue-300 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
              sin tus productos favoritos
            </span>
          </h2>

          <p className="text-white/50 text-base sm:text-lg max-w-2xl mx-auto mb-4 leading-relaxed">
            Explora nuestro catálogo completo con más de 500 productos. Haz tu pedido en minutos y recíbelo en la puerta de tu casa.
          </p>

          {/* Urgency text */}
          <p className="text-amber-300/70 text-sm font-semibold mb-10">
            ⚡ Los productos populares se agotan rápido — ¡Asegura tu pedido!
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <Link
              href="/tienda"
              onClick={() => trackCTAClick({ source: "cta-banner", destination: "/tienda", ctaText: "Ir a la tienda" })}
              className="group inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-base font-extrabold text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #93c5fd 0%, #3b82f6 50%, #2563eb 100%)",
                boxShadow: "0 8px 32px -4px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              Ir a la tienda
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://wa.me/51916409675?text=Hola%2C%20quiero%20hacer%20un%20pedido"
              onClick={() => trackWhatsAppClick("cta-banner")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-bold text-white border border-white/15 bg-white/6 backdrop-blur-sm hover:bg-white/12 transition-all duration-300"
            >
              💬 Pedir por WhatsApp
            </a>
          </div>

          {/* Perks */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {PERKS.map((perk) => (
              <div key={perk.label} className="flex flex-col items-center gap-2.5">
                <div
                  className="flex items-center justify-center h-12 w-12 rounded-xl"
                  style={{ background: perk.color + "18" }}
                >
                  <perk.icon className="h-5 w-5" style={{ color: perk.color }} />
                </div>
                <span className="text-white/60 text-xs sm:text-sm font-medium text-center leading-snug">
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
