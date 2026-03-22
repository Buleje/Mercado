"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { Truck, BadgePercent, ShieldCheck, Leaf, ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import AnimatedCounter from "@/components/ui/AnimatedCounter";
import { useSettings } from "@/contexts/settings-context";

/* Visual defaults per slot (icon, accent, glow). Text & stats come from settings. */
const SLOT_DEFAULTS = [
  { icon: Truck, accent: "#3b82f6", glow: "rgba(59,130,246,0.25)", title: "Delivery Rápido", description: "Entrega a domicilio en toda la zona urbana de Pucallpa.", back: "Tiempo estimado: ~30 min en zona urbana.", stat: 30, statSuffix: " min", statLabel: "entrega promedio" },
  { icon: BadgePercent, accent: "#f59e0b", glow: "rgba(245,158,11,0.25)", title: "Pago con Yape o Efectivo", description: "Paga fácil con Yape o en efectivo contra entrega.", back: "Sin tarjetas, sin cargos, sin complicaciones.", stat: 0, statSuffix: " comisiones", statLabel: "sin comisiones extra" },
  { icon: ShieldCheck, accent: "#2d6a4f", glow: "rgba(45,106,79,0.25)", title: "Calidad Garantizada", description: "Productos seleccionados y verificados para tu familia.", back: "Si no estás satisfecho, te devolvemos tu dinero.", stat: 100, statSuffix: "%", statLabel: "satisfacción" },
  { icon: Leaf, accent: "#8b5cf6", glow: "rgba(139,92,246,0.25)", title: "Productos Frescos", description: "Carne, pollo, frutas y verduras frescas todos los días.", back: "Stock renovado cada mañana. Proveedores locales.", stat: 500, statSuffix: "+", statLabel: "productos en stock" },
];

export default function Benefits() {
  const { homepage: hp } = useSettings();

  /* Merge admin text/stats with visual defaults */
  const benefits = useMemo(() =>
    SLOT_DEFAULTS.map((slot, i) => {
      const admin = hp.benefitItems?.[i];
      return {
        icon: slot.icon,
        accent: slot.accent,
        glow: slot.glow,
        title: admin?.title || slot.title,
        description: admin?.description || slot.description,
        back: admin?.back || slot.back,
        stat: admin?.stat ?? slot.stat,
        statSuffix: admin?.statSuffix ?? slot.statSuffix,
        statLabel: admin?.statLabel ?? slot.statLabel,
      };
    }), [hp.benefitItems]);
  const [sectionRef, inView] = useInView({ threshold: 0.1 });
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hasAnimated = useRef(false);

  const onSpotlight = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--sx", `${x}%`);
    el.style.setProperty("--sy", `${y}%`);
  }, []);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    import("gsap").then(({ gsap }) => {
      gsap.fromTo(
        cardRefs.current,
        { opacity: 0, y: 40, scale: 0.94 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.65,
          ease: "back.out(1.3)",
          stagger: { amount: 0.5 },
        }
      );
    });
  }, [inView]);

  return (
    <section id="beneficios" className="py-20 sm:py-28 bg-surface relative overflow-hidden" ref={sectionRef}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[40vw] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(45,106,79,0.06) 0%, transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Nuestras ventajas
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            ¿Por qué{" "}
            <span className="text-primary relative">
              elegirnos
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            ?
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            Tu tienda virtual de productos de consumo en Pucallpa con delivery rápido y pago fácil.
          </p>
        </div>

        <style>{`
          .benefit-flip { perspective: 900px; }
          .benefit-flip-inner {
            position: relative; width: 100%; height: 100%;
            transform-style: preserve-3d;
            transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
          }
          .benefit-flip:hover .benefit-flip-inner { transform: rotateY(180deg); }
          .benefit-face {
            position: absolute; inset: 0;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
          }
          .benefit-back { transform: rotateY(180deg); }
          .benefit-spotlight::after {
            content: "";
            position: absolute; inset: 0;
            border-radius: inherit;
            background: radial-gradient(circle at var(--sx, 50%) var(--sy, 50%), rgba(255,255,255,0.08) 0%, transparent 55%);
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
          }
          .benefit-spotlight:hover::after { opacity: 1; }
        `}</style>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {benefits.map((benefit, i) => (
            <div
              key={benefit.title}
              ref={(el) => { cardRefs.current[i] = el; }}
              onMouseMove={onSpotlight}
              style={{ height: 280, opacity: 0, willChange: "transform, opacity" }}
              className="benefit-flip benefit-spotlight group relative rounded-2xl cursor-default"
            >
              <div className="benefit-flip-inner h-full">
                {/* Front face — glassmorphism */}
                <div
                  className="benefit-face rounded-2xl p-7 sm:p-8 text-center border overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    borderColor: benefit.accent + "30",
                    boxShadow: `0 4px 24px ${benefit.glow}, inset 0 1px 0 rgba(255,255,255,0.8)`,
                  }}
                >
                  <div className="dark:hidden">
                    <div
                      className="inline-flex items-center justify-center h-13 w-13 rounded-xl mb-5 transition-transform duration-300 group-hover:scale-110"
                      style={{ background: benefit.accent + "18", color: benefit.accent }}
                    >
                      <benefit.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-foreground mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted leading-relaxed">{benefit.description}</p>
                    <p className="text-[10px] text-muted/60 mt-3 font-medium">Pasa el cursor para ver más →</p>
                  </div>
                  {/* Dark mode version */}
                  <div className="hidden dark:block">
                    <div
                      className="inline-flex items-center justify-center h-13 w-13 rounded-xl mb-5"
                      style={{ background: benefit.accent + "22", color: benefit.accent }}
                    >
                      <benefit.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-foreground mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted leading-relaxed">{benefit.description}</p>
                  </div>
                </div>

                {/* Back face — with AnimatedCounter metric */}
                <div
                  className="benefit-face benefit-back rounded-2xl p-7 sm:p-8 flex flex-col items-center justify-center text-center"
                  style={{
                    background: `linear-gradient(145deg, ${benefit.accent}ee, ${benefit.accent}bb)`,
                    boxShadow: `0 8px 32px ${benefit.glow}`,
                  }}
                >
                  <benefit.icon className="h-8 w-8 text-white mb-3" />
                  {benefit.stat > 0 && (
                    <div className="mb-3">
                      <div className="text-4xl font-black text-white leading-none">
                        <AnimatedCounter end={benefit.stat} suffix={benefit.statSuffix} duration={1.6} />
                      </div>
                      <div className="text-xs text-white/70 font-medium mt-1">{benefit.statLabel}</div>
                    </div>
                  )}
                  {benefit.stat === 0 && (
                    <div className="mb-3">
                      <div className="text-3xl font-black text-white">S/ 0</div>
                      <div className="text-xs text-white/70 font-medium mt-1">{benefit.statLabel}</div>
                    </div>
                  )}
                  <h3 className="text-sm font-extrabold text-white mb-2">{benefit.title}</h3>
                  <p className="text-xs text-white/85 leading-relaxed">{benefit.back}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-12 transition-all duration-700 delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group inline-flex items-center gap-2.5 text-primary hover:text-primary-dark font-bold text-base transition-colors"
          >
            Empieza a comprar ahora
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
