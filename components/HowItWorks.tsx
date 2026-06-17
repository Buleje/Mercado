"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ShoppingCart, CreditCard, Truck, ArrowRight } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";
import { useTilt } from "@/hooks/use-tilt";

const STEPS = [
  {
    num: 1,
    icon: ShoppingCart,
    title: "Elige tus productos",
    desc: "Explora nuestro catálogo con más de 500 productos y agrega al carrito lo que necesites.",
    color: "#3b82f6",
    shadow: "rgba(59,130,246,0.3)",
  },
  {
    num: 2,
    icon: CreditCard,
    title: "Paga fácil",
    desc: "Paga con Yape o en efectivo contra entrega. Sin complicaciones ni tarjetas.",
    color: "#ff6b5b",
    shadow: "rgba(245,158,11,0.3)",
  },
  {
    num: 3,
    icon: Truck,
    title: "Recibe en tu puerta",
    desc: "Te llevamos tu pedido a domicilio en menos de 30 minutos.",
    color: "var(--accent)",
    shadow: "rgba(45,106,79,0.3)",
  },
];

function StepCard({ step, cardRef }: { step: typeof STEPS[0]; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const { tiltRef, onTiltMove, onTiltLeave } = useTilt({ max: 12, scale: 1.04 });

  return (
    <div ref={cardRef} className="step-card opacity-0" style={{ willChange: "transform, opacity" }}>
      <div
        ref={tiltRef}
        onMouseMove={onTiltMove}
        onMouseLeave={onTiltLeave}
        className="relative flex flex-col items-center text-center tilt-card rounded-3xl p-8 cursor-default h-full"
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${step.color}22`,
          boxShadow: `0 8px 32px ${step.shadow}`,
        }}
      >
        {/* Shine overlay for tilt effect */}
        <div className="tilt-shine" data-tilt-shine />

      {/* Animated step number ring */}
      <div className="step-num-ring relative flex items-center justify-center mb-6" style={{ width: 96, height: 96 }}>
        <svg className="absolute inset-0" viewBox="0 0 96 96" fill="none">
          <circle cx="48" cy="48" r="44" stroke={step.color} strokeWidth="2" strokeOpacity="0.2" />
          <circle
            className="step-arc"
            cx="48" cy="48" r="44"
            stroke={step.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="276"
            strokeDashoffset="276"
            style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
          />
        </svg>
        <div
          className="relative flex items-center justify-center h-16 w-16 rounded-2xl"
          style={{
            background: `linear-gradient(145deg, ${step.color}22, ${step.color}10)`,
            boxShadow: `0 8px 24px ${step.shadow}, inset 0 1px 0 rgba(255,255,255,0.6)`,
          }}
        >
          <step.icon
            className="h-8 w-8"
            style={{ color: step.color, filter: `drop-shadow(0 4px 8px ${step.shadow})` }}
          />
          <span
            className="absolute -top-2 -right-2 flex items-center justify-center h-7 w-7 rounded-full text-xs font-extrabold text-white"
            style={{
              background: `linear-gradient(135deg, ${step.color}, ${step.color}bb)`,
              boxShadow: `0 4px 12px ${step.shadow}`,
            }}
          >
            {step.num}
          </span>
        </div>
      </div>

      <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
        {step.title}
      </h3>
      <p className="text-sm text-muted leading-relaxed max-w-xs">
        {step.desc}
      </p>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const [sectionRef, inView] = useInView({ threshold: 0.15 });
  const card0Ref = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    const cardRefs = [card0Ref.current, card1Ref.current, card2Ref.current];

    // Lazy-load GSAP only when in view
    import("gsap").then(({ gsap }) => {
      // Stagger card entrance
      gsap.fromTo(
        cardRefs,
        { opacity: 0, y: 48, scale: 0.92 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.7,
          ease: "back.out(1.4)",
          stagger: 0.15,
        }
      );

      // Animate step arc SVG stroke after cards appear
      const arcs = document.querySelectorAll<SVGCircleElement>(".step-arc");
      arcs.forEach((arc, i) => {
        gsap.to(arc, {
          strokeDashoffset: 0,
          duration: 1.0,
          ease: "power2.out",
          delay: 0.3 + i * 0.18,
        });
      });

      // Animate connecting line
      if (lineRef.current) {
        const length = lineRef.current.getTotalLength();
        gsap.set(lineRef.current, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
        gsap.to(lineRef.current, { strokeDashoffset: 0, duration: 1.2, ease: "power3.out", delay: 0.2 });
      }
    });
  }, [inView]);

  const cardRefs = [card0Ref, card1Ref, card2Ref];

  return (
    <section ref={sectionRef} className="py-20 sm:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[30vw] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Así de fácil
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            ¿Cómo{" "}
            <span className="text-primary relative">
              funciona
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            ?
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            Comprar en Buleje es rápido, seguro y sin complicaciones.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative">
          {/* Morphing SVG connector — visible on md+ */}
          <svg
            className="hidden md:block absolute"
            style={{ top: 48, left: "16.67%", width: "66.67%", height: 24, overflow: "visible", pointerEvents: "none", zIndex: 0 }}
            viewBox="0 0 400 24"
            fill="none"
          >
            <defs>
              <linearGradient id="connGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#ff6b5b" />
                <stop offset="100%" stopColor="var(--accent)" />
              </linearGradient>
            </defs>
            <path
              ref={lineRef}
              d="M 0,12 C 80,4 120,20 200,12 C 280,4 320,20 400,12"
              stroke="url(#connGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0"
            />
            {/* Arrow heads */}
            <polygon points="184,8 196,12 184,16" fill="#ff6b5b" opacity="0.6" />
            <polygon points="384,8 396,12 384,16" fill="var(--accent)" opacity="0.6" />
          </svg>

          {STEPS.map((step, i) => (
            <StepCard key={step.num} step={step} cardRef={cardRefs[i]} />
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-14 transition-all duration-[var(--dur-slower)] delay-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group relative inline-flex items-center gap-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-xl px-7 py-3.5 shadow-[var(--shadow-lg)] shadow-primary/20 hover:shadow-[var(--shadow-xl)] transition-all duration-[var(--dur-base)] hover:-translate-y-0.5 overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2.5">
              Empezar a comprar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
